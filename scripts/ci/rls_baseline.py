#!/usr/bin/env python3
"""Compara o relatório JSON do vibe-scanner com a linha de base (.rls-baseline).

Falha (código 1) só quando aparece achado CRITICAL ou HIGH que não está na
linha de base -- os já analisados ficam registrados lá, como no
.gitleaksignore. Cada achado é identificado por "regra | tabela | política".

Também faz uma checagem própria (ZSEC-RLS-001): tabela de public criada nas
migrations sem nenhum "ENABLE ROW LEVEL SECURITY". No modo local o
vibe-scanner só enxerga tabelas que aparecem em comandos de RLS, então a
tabela totalmente sem RLS -- o caso mais grave -- passaria por ele.

Uso:
  rls_baseline.py <relatorio.json> <.rls-baseline> <pasta-migrations>           # verifica (CI)
  rls_baseline.py <relatorio.json> <.rls-baseline> <pasta-migrations> --gerar   # reescreve a linha de base
  ... --exportar <saida.json>   # grava os achados NOVOS (fora da linha de base) para o módulo SAST
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

SEVERIDADES = {"CRITICAL", "HIGH"}

_NOME = r'"?([a-z_][a-z0-9_]*)"?'
_CREATE = re.compile(r'create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?(\w+)"?\.)?' + _NOME + r"\s*\(", re.I)
_ENABLE = re.compile(
    r"alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:\"?public\"?\.)?" + _NOME + r"\s+enable\s+row\s+level\s+security",
    re.I,
)
_DROP = re.compile(r"drop\s+table\s+(?:if\s+exists\s+)?(?:\"?public\"?\.)?" + _NOME, re.I)


def tabelas_sem_rls(pasta: str) -> dict[str, dict]:
    """Tabelas de public que nenhuma migration liga o RLS (na ordem das migrations)."""
    criadas: dict[str, str] = {}
    com_rls: set[str] = set()
    for arq in sorted(Path(pasta).glob("*.sql")):
        sql = re.sub(r"--[^\n]*", "", arq.read_text(encoding="utf-8"))
        for m in _CREATE.finditer(sql):
            if (m.group(1) or "public").lower() == "public":
                criadas[m.group(2).lower()] = arq.name
        com_rls |= {t.lower() for t in _ENABLE.findall(sql)}
        for t in _DROP.findall(sql):
            criadas.pop(t.lower(), None)
    return {
        f"ZSEC-RLS-001 | {t} | -": {
            "rule_id": "ZSEC-RLS-001",
            "rule_name": "Tabela sem ENABLE ROW LEVEL SECURITY",
            "severity": "CRITICAL",
            "file": f"supabase/migrations/{arq}",
            "description": f"A tabela public.{t} (criada em {arq}) não tem RLS ligado em nenhuma migration: "
            "com a chave pública do app, qualquer visitante lê e grava nela.",
            "remediation": f"ALTER TABLE public.{t} ENABLE ROW LEVEL SECURITY; e crie as políticas.",
        }
        for t, arq in criadas.items()
        if t not in com_rls
    }


def chave(f: dict) -> str:
    return f"{f.get('rule_id')} | {f.get('table_name') or '-'} | {f.get('policy_name') or '-'}"


def carregar_achados(caminho: str) -> dict[str, dict]:
    with open(caminho, encoding="utf-8") as fh:
        achados = json.load(fh).get("findings", [])
    return {chave(f): f for f in achados if str(f.get("severity", "")).upper() in SEVERIDADES}


def carregar_base(caminho: str) -> set[str]:
    try:
        with open(caminho, encoding="utf-8") as fh:
            linhas = [l.strip() for l in fh]
    except FileNotFoundError:
        return set()
    return {l for l in linhas if l and not l.startswith("#")}


def gerar(achados: dict[str, dict], caminho: str) -> None:
    por_regra: dict[str, list[str]] = defaultdict(list)
    nomes: dict[str, str] = {}
    for k, f in achados.items():
        por_regra[f["rule_id"]].append(k)
        nomes[f["rule_id"]] = f"{f.get('severity')} -- {f.get('rule_name')}"
    with open(caminho, "w", encoding="utf-8") as fh:
        fh.write(
            "# Achados CRITICAL/HIGH do vibe-scanner já analisados (job \"rls\" do CI).\n"
            "# Formato: regra | tabela | política. Achado novo fora desta lista falha o CI.\n"
            "# Ao aceitar um achado novo, acrescente a linha com um comentário do motivo.\n"
        )
        for regra in sorted(por_regra):
            fh.write(f"\n# {regra}: {nomes[regra]}\n")
            fh.writelines(f"{k}\n" for k in sorted(por_regra[regra]))
    print(f"Linha de base gravada: {len(achados)} achado(s) em {caminho}")


def exportar(achados: dict[str, dict], base: set[str], caminho: str) -> None:
    """Só os achados fora da linha de base: os da linha de base já foram analisados."""
    campos = ("rule_id", "rule_name", "severity", "table_name", "policy_name", "description", "remediation", "file")
    novos = [
        {c: achados[k].get(c) for c in campos} | {"table_name": achados[k].get("table_name") or k.split(" | ")[1]}
        for k in sorted(achados)
        if k not in base
    ]
    with open(caminho, "w", encoding="utf-8") as fh:
        json.dump(novos, fh, ensure_ascii=False)


def verificar(achados: dict[str, dict], base: set[str]) -> int:
    novos = sorted(k for k in achados if k not in base)
    resolvidos = sorted(k for k in base if k not in achados)
    print(f"Achados CRITICAL/HIGH: {len(achados)} | na linha de base: {len(base)} | novos: {len(novos)}")
    if resolvidos:
        print(f"\n{len(resolvidos)} achado(s) da linha de base não aparecem mais -- pode removê-los:")
        for k in resolvidos:
            print(f"  - {k}")
    if not novos:
        print("\nNenhum achado novo de RLS.")
        return 0
    print("\nACHADOS NOVOS:")
    for k in novos:
        f = achados[k]
        print(f"\n[{f.get('severity')}] {k}\n  {f.get('description')}\n  Correção: {f.get('remediation')}")
    return 1


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    achados = carregar_achados(sys.argv[1]) | tabelas_sem_rls(sys.argv[3])
    extras = sys.argv[4:]
    if "--gerar" in extras:
        gerar(achados, sys.argv[2])
        return 0
    base = carregar_base(sys.argv[2])
    if "--exportar" in extras:
        exportar(achados, base, extras[extras.index("--exportar") + 1])
    return verificar(achados, base)


if __name__ == "__main__":
    sys.exit(main())
