# Ilustrações da abertura

- `ruinas.png`: ilustração horizontal incorporada ao *Trespasser v2.1.3 - Rulebook.pdf*, página 258, imagem `/Image5831`, 1545 × 782 pixels. Extraída do documento fornecido pelo usuário sem retoques e preservada como referência; não usada na abertura atual. O livro não identifica um artista individual para esta imagem.
- `castelo.png`: ilustração vertical fornecida pelo usuário, preservada como fonte da abertura em telas estreitas. `castelo-mobile.webp` é a cópia de exibição otimizada (261.272 bytes).
- `gravuras/`: cinco ilustrações fornecidas pelo usuário. As cópias WebP desta pasta preservam integralmente os pixels dos originais. Proveniência e verificação constam no [README das gravuras](gravuras/README.md).
- `panorama-desktop.webp`: as cinco gravuras já compostas em 2560 × 1440 px (1.635.436 bytes). `panorama-compact.webp` adapta os enquadramentos para telas de 621 a 1100 px em 1440 × 1280 px (856.606 bytes). Esses derivados usam WebP qualidade 92, recortes, máscaras suaves e correção de luminosidade individual para equilibrar o portal e o abismo. As fontes permanecem intactas. A marca, os textos, a sombra de leitura e os controles continuam em HTML/CSS.
- `capa.png`: capa original fornecida pelo usuário, 487 × 630 pixels, preservada como referência; não usada na abertura atual. O panorama usa a versão da ilustração do monstro sem os textos da capa.

Trespasser é de Tundalus / Haven Games. Esta ficha é um projeto não oficial. As ilustrações não são desenhos originais desta aplicação, e a distribuição do código não altera os direitos sobre elas.

Fonte do sistema: [Trespasser: Dark Fantasy Tactics](https://tundalus.itch.io/trespasser). O crédito geral e o aviso sobre as ilustrações constam na página 2 do Rulebook.

## Reconstruir os derivados

Execute `node scripts/build-landing-art.mjs` com o pacote Sharp disponível, ou passe o caminho absoluto do módulo Sharp como primeiro argumento. O script exporta somente os três derivados acima, sem modificar as gravuras e o castelo de origem. Não é necessário reconstruir as artes para servir o site.

O navegador seleciona uma única imagem com `<picture>`, antecipa sua transferência e só revela a cena depois de `load` e `decode()`. A mudança entre fontes responsivas também espera a nova imagem estar pronta. Conteúdo, autenticação e botões não dependem desse carregamento. Falhas de imagem deixam o fundo neutro utilizável.
