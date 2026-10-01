// Proxy script -- bloqueia midia binaria pesada ANTES de sair pro alvo real.
// Existe porque core/action/excludeFromProxy + spider/action/excludeFromScan
// (mesma lista de extensoes, ver ZAP_STATIC_ASSET_EXCLUDE_REGEX em main.py)
// NAO impedem o Ajax Spider (Crawljax + Firefox headless real) de baixar
// esses arquivos -- confirmado em producao (2026-09-28): video de 116MB
// baixado 7+ vezes por www.bernoulli.com.br mesmo com a exclusao generica
// ja ativa, afogando CPU/banda da JVM compartilhada e travando o active
// scan em 0% por 20min+.
//
// GOTCHA (achado testando ao vivo): retornar 'false' de proxyRequest() faz
// o ZAP so' fechar a conexao sem mandar nada ("empty reply from server"),
// mesmo com a resposta customizada ja setada no msg -- confirmado em HTTP
// puro e HTTPS, dominio real e inexistente. O bloqueio funciona com
// return TRUE: a resposta ja setada no msg (via cloneAll +
// setResponseHeader(string), mesmo padrao do exemplo comentado no template
// oficial do ZAP) e' o que importa; o retorno da funcao nao controla se
// encaminha ou nao pro alvo.
var MEDIA_EXT_REGEX = /\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?|mp4|webm|mov|avi|mkv|flv|mp3|wav|ogg|m4a|woff2?|ttf|eot|otf|pdf|zip|rar|7z|tar|gz)(\?.*)?$/i;

function proxyRequest(msg) {
    var url = msg.getRequestHeader().getURI().toString();
    if (MEDIA_EXT_REGEX.test(url)) {
        print("[block-heavy-media] bloqueando: " + url);
        var msg2 = msg.cloneAll();
        msg2.setResponseHeader("HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        msg.setResponseHeader(msg2.getResponseHeader());
        msg.setResponseBody("");
        msg.getResponseHeader().setContentLength(0);
        return true;
    }
    return true;
}

function proxyResponse(msg) {
    return true;
}
