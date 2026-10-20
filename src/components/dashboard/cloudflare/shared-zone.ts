import * as React from "react";

// Zona escolhida na barra do módulo Cloudflare. Com ela, cada quadro de
// Operações usa essa zona e esconde o próprio seletor; sem ela (null), os
// seletores de zona continuam funcionando como antes.
export const SharedZoneContext = React.createContext<string | null>(null);

/** Abre uma tela do módulo (ex.: "waf", "managed", "rules") a partir de componentes internos */
export const CfNavContext = React.createContext<
  ((view: "waf" | "managed" | "rules" | "pagerules" | "lb") => void) | null
>(null);
