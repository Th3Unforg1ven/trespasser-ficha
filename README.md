# Trespasser · Ficha de personagem

Ficha editável fan-made para Trespasser v2.1.3, em português com termos originais ou em inglês. Implementação em HTML, CSS e JavaScript, com bibliotecas incluídas localmente e sem dependências de instalação. Projeto de [Th3Unforg1ven](https://github.com/Th3Unforg1ven).

## Acessar online

[Abrir a ficha](https://th3unforg1ven.github.io/trespassercs/)

Quem ainda não entrou vê uma apresentação do app e o botão **Começar**. Ele abre a janela **Entrar ou criar conta**, com acesso pelo Google. Depois de entrar, a tela inicial mostra **Registro de Personagens** e **Registro de Refúgios**. Use o mesmo Google no celular e no computador para continuar a edição. **Início** volta à tela com as ilustrações. Nenhum popup de configuração ou transferência de fichas é aberto automaticamente.

O ícone no canto superior alterna diretamente entre modo claro e escuro na abertura e nos registros. O menu **Configurações**, acessível pela engrenagem da tela inicial conectada ou por **Ajustes** na ficha, reúne aparência e conta, incluindo **Sair deste dispositivo** e a opção de tema **Automático**. A preferência acompanha este navegador e é independente das fichas. Automático segue a aparência do dispositivo. O modo escuro conserva o contraste e as molduras da ficha, enquanto impressão e PDF continuam em papel claro. O salvamento online é automático, sem botão de sincronização manual.

Uma breve tela de carregamento acompanha a abertura dos registros. Personagens só são exibidos depois de verificar a sessão e preparar os dados; refúgios também aguardam sua verificação inicial. A transição preserva o foco, respeita movimento reduzido e não mantém a interface bloqueada indefinidamente se a conexão falhar.

**Idioma** em Configurações oferece **Automático (dispositivo)**, **Português** e **English**. Automático usa português quando o idioma principal do navegador é `pt` ou `pt-*`, e inglês nos demais casos. A preferência é independente por navegador e segue as telas inicial, de personagens e de refúgios. Trocar o idioma altera a interface, sem traduzir nomes, anotações e outros textos digitados ou alterar dados das fichas.

O cabeçalho da capa mantém somente a versão à direita; os controles ficam à esquerda e o rodapé credita o GitHub e identifica o projeto como fan-made. O botão **Refúgios** na barra do personagem abre o outro registro com a mesma transição de carregamento.

O retrato do personagem tem importação PNG/JPEG/WebP, zoom e posição horizontal/vertical. O enquadramento é uma edição temporária até **Salvar retrato**. A imagem é convertida em uma cópia reduzida, de até 800 px, e armazenada dentro do JSON privado da ficha, acompanhando o salvamento online e a importação/exportação. O PDF mantém seus campos preenchíveis e inclui o retrato enquadrado em uma página própria. Não é criado um endereço público separado para a foto.

**Aflições / Plights** apresenta as dez opções de *Common Plights*, na página 58 do Rulebook: Afraid, Angry, Befuddled, Clumsy, Conspicuous, Discouraged, Distracted, Enfeebled, Sickly e Sluggish. Os efeitos permanecem sob controle da mesa. Fichas anteriores preservam o texto livre em **Anotações anteriores**; nenhuma anotação é apagada ao adotar as seleções. JSON e PDF incluem as escolhas e o conteúdo legado.

Depois de entrar, use **Salvar minhas fichas locais na conta** para enviar personagens que já estavam neste endereço. A cópia local é mantida. Fichas de outro endereço, como localhost, podem ser importadas por JSON uma vez.

**Exportar** prepara um ZIP com PDF preenchível e JSON do mesmo personagem, com opções para baixar cada arquivo separadamente. Textos longos e feitos ou itens excedentes recebem páginas adicionais, também preenchíveis. Os cálculos exportados podem ser editados manualmente no PDF.

## Registro de Refúgios

[Abrir os refúgios](https://th3unforg1ven.github.io/trespassercs/havens.html). A ficha de Haven inclui seis atributos, doze perícias, nível, grau de população, riqueza, despesas, chegadas e evento; construções e projetos com relógios; fortalezas, contratados, cadeias de produção, itens e anotações. Os títulos e campos acompanham o idioma da interface; em português, preservam os termos originais.

O salvamento de refúgios é automático e separado dos personagens, com cache privado por conta. O mesmo login abre os refúgios em outros dispositivos. Cópias locais anteriores permanecem preservadas; copiá-las para a conta exige uma ação explícita em Configurações. Exportar gera PDF preenchível e JSON; importar o JSON cria uma nova ficha.

Bônus de perícia, espaços de construção, limites e despesas são calculados a partir dos valores registrados. Avanço de nível, efeitos de construções, manutenção, alterações de riqueza e consequências dos eventos são resolvidos na mesa. As taxas dos contratados podem ser ajustadas. A ficha usa a tabela de avanço 0–9 e as doze perícias listadas no livro e na folha oficial; não inventa entradas para as menções divergentes a nível 10 e quatorze perícias na prosa. Para artesão, cozinheiro e arauto, usa as taxas de 100 cp do livro, com ajuste manual disponível para mesas que adotam os 50 cp impressos na folha.

## Executar localmente

Com Node.js instalado, abra um terminal nesta pasta:

```powershell
npm run dev
```

Acesse [http://127.0.0.1:4173](http://127.0.0.1:4173). O servidor aceita conexões apenas neste computador. Para validar o código:

```powershell
npm test
npm run check
```

`node scripts/check-sdk-http.mjs` executa uma verificação adicional do SDK real contra um servidor HTTP local, sem acessar a base de produção. Esse teste precisa de permissão para abrir uma porta de loopback.

O conteúdo publicado está em `dist/`. O workflow `.github/workflows/pages.yml` valida o JavaScript, executa os testes e publica somente essa pasta no GitHub Pages a cada atualização da branch `main`. Livros de referência, cópias pessoais, resultados de teste e arquivos temporários não fazem parte da publicação.

## Uso e alcance

- Criação, duplicação e exclusão de personagens; suporte a níveis 0–9.
- Identidade, atributos, perícias, alinhamentos, equipamentos, inventário, feitos, estados, ferimentos e anotações editáveis.
- Valores derivados, recursos atuais, rolagens livres e acompanhamento do custo crescente dos feitos.
- Exportação em PDF preenchível e JSON (juntos em ZIP ou separadamente), importação do JSON e impressão de todas as seções.

O avanço de nível e as escolhas de vocação (Calling), ofício (Craft), talentos e características são manuais. Bônus específicos entram nos ajustes de regras. Estados e aflições ficam registrados; seus efeitos são resolvidos na mesa. A ficha não substitui as decisões do Judge nem implementa automaticamente todas as exceções do livro.

## Cálculos e fontes

Referência: Rulebook e Character Record dos arquivos fornecidos de Trespasser v2.1.3. As páginas abaixo são as páginas numeradas do Rulebook; os documentos originais foram consultados localmente e não são distribuídos neste repositório.

| Valor | Regra básica |
| --- | --- |
| PV máximos | `(nível + 1) × (5 + Might)`, mais ajustes da vocação e outros benefícios |
| Endurance máxima | `10 + Spirit`, mais ajustes; indisponível no nível 0 |
| Skill / Skill die | `+2 / d6` nos níveis 0–2; `+3 / d8` em 3–5; `+4 / d10` em 6–8; `+5 / d12` em 9 |
| Precisão (Accuracy) | atributo-chave + Skill; no nível 0, maior entre Might e Agility + Skill |
| Guarda (Guard) | Agility + AR; com AR ≥ 6, apenas AR |
| Iniciativa / Resistir / Prevalecer | Agility / Spirit / Intellect + Skill |
| Tenacidade (Tenacity) | Might + Spirit |
| Velocidade (Speed) | base 5; bônus igual ao maior entre Agility e 2; com AR ≥ 6, bônus limitado a 2 |
| Inventário | 5 + Might espaços |

Os ajustes manuais são somados aos valores correspondentes. A quantidade diária de dados de recuperação é registrada separadamente e não muda automaticamente quando a Endurance atual diminui. Alterar atributos, nível ou máximos não recupera os recursos atuais.

Fontes principais: pp.11–12 (atributos e perícias), 22–24 (valores e descanso), 44–45 (foco e recuperação), 69 (descanso noturno), 71 e 75 (equipamentos e armadura), 86 (Commoners) e 88–90 (avanço). O descanso noturno recupera PV quando a Endurance restante é maior que zero, redefine os dados de recuperação pela Endurance restante e limpa os custos crescentes; alimentação e condições do descanso precisam ser resolvidas na mesa.

## Salvamento

Com uma conta conectada, o site salva automaticamente no Supabase e verifica atualizações a cada 15 segundos e ao voltar à aba. O indicador **Salvo online** confirma a sincronização. Alterações offline ficam pendentes no cache da conta neste dispositivo e são reenviadas quando a conexão volta. Evite editar a mesma ficha simultaneamente: campos distintos podem ser mesclados; alterações incompatíveis são preservadas em uma ficha com **(conflito)** no nome.

O cache é separado por conta. **Sair deste dispositivo** volta às fichas de visitante, mantendo o cache privado para o próximo login. O navegador guarda uma sessão de acesso; em computador compartilhado, saia ao terminar. Limpar os dados do navegador apaga fichas de visitante e alterações que ainda não chegaram à nuvem.

Use uma aba da conta por navegador. Uma trava entre abas impede que duas cópias sobrescrevam alterações offline no mesmo cache. Se a conta já estiver aberta, feche a outra aba e recarregue; navegadores sem a API Web Locks precisam ser atualizados para usar o salvamento online.

Os dados remotos ficam na tabela exclusiva `trespasser_characters` do projeto Biocoded, com políticas que permitem a cada usuário acessar apenas suas fichas. O projeto e o login são compartilhados com Biocoded; os objetos existentes são preservados. O esquema e os testes de acesso estão em `backend/`.

Use Exportar para guardar os dois arquivos do mesmo personagem. O PDF permite preencher e salvar seus campos em um leitor compatível; use o JSON para restaurar a ficha no site. A importação cria um novo personagem. As cópias do navegador, do PDF e do JSON são independentes.

A biblioteca Supabase está incluída em `dist/vendor/`, com versão exata no `package-lock.json`. Para reproduzir essa cópia, execute `npm ci` e `npm run vendor:supabase`. A configuração pública está em `dist/cloud-config.js`; nenhuma chave secreta ou senha é necessária no site.

## Limite da verificação de impressão

O ícone de impressão prepara uma cópia com valores estáticos e textos completos para papel. Para obter um PDF preenchível, use Exportar. O PDF dessa exportação foi validado por renderização, preenchimento, salvamento e reabertura; o diálogo nativo de impressão continua dependendo das opções do navegador.

Os documentos de referência são material de consulta do sistema. Não são necessários para executar o site e não fazem parte da pasta pública `dist/`.

## Direção visual

A interface acompanha a ficha impressa: composição em três colunas, recursos com réguas no topo, molduras pretas com recortes, campos retangulares e papel claro. A identificação usa o logotipo incorporado ao PDF fornecido (Rulebook, página 1), sem alteração do arquivo da imagem.

A tela inicial usa as cinco gravuras fornecidas pelo usuário em um único panorama já composto: escadaria, cavaleiro, monstro, portal e abismo. As bordas suaves e a luminosidade equilibrada são exportadas previamente, evitando que a lateral direita apareça em blocos. As fontes originais permanecem preservadas; os derivados de exibição usam WebP qualidade 92. O navegador baixa uma única imagem por faixa: panorama amplo acima de 1100 px, composição compacta entre 621 e 1100 px e adaptação vertical das mesmas cinco gravuras até 620 px. A cena aparece por uma transição de opacidade somente depois de carregar e decodificar a fonte atual, inclusive ao mudar de orientação. O conteúdo e os botões continuam independentes da arte. A abertura respeita movimento reduzido e mantém geometria fixa, sem animações de posição. Proveniência e reconstrução dos derivados constam em `dist/assets/landing/README.md`. O título permanece acessível ao teclado e a leitores de tela. O retorno do Google mostra os dois registros na tela inicial.

Botões e ícones seguem uma linguagem própria de gravura: silhuetas de tinta, molduras duplas, bordas recortadas e títulos góticos. Os ícones vetoriais são desenhos originais do projeto, incluindo grimório, elmo, tocha, espada, dados e pergaminhos. Os rótulos continuam visíveis, e os controles mantêm foco de teclado e estados de carregamento e indisponibilidade.

Lusitana é usada no corpo e Pirata One nos títulos, com preferência por Boucherie Block caso já esteja instalada. Boucherie Block e Nexa Rust são indicadas pelo guia, mas seus arquivos comerciais não foram extraídos. As fontes abertas estão hospedadas localmente, com os avisos SIL OFL em `dist/assets/fonts/`. Fontes: repositório oficial Google Fonts, famílias [Pirata One](https://github.com/google/fonts/tree/main/ofl/pirataone) e [Lusitana](https://github.com/google/fonts/tree/main/ofl/lusitana).
