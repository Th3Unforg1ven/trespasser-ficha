# Armazenamento de fichas

`schema.sql` prepara os objetos `trespasser_*` no projeto Supabase Biocoded
(`wheanskxobszhatpyyqk`), reutilização autorizada pelo usuário. Este arquivo e os
testes são fontes para revisão; sua presença não configura um serviço remoto.
Nunca colocar uma chave `service_role`, secret key ou senha de banco no site.
O navegador utiliza a URL pública, a publishable key e a sessão do próprio usuário.

## Contrato do cliente

```js
const { data, error } = await supabase.rpc('trespasser_save_character', {
  p_id: character.id,
  p_data: character,
  p_expected_revision: acknowledgedRevision, // 0 para criar
  p_deleted: false,
});
```

- Sucesso: `data` contém uma linha com `user_id`, `id`, `data`, `revision`,
  `created_at`, `updated_at` e `deleted_at`.
- Conflito: `data` é `[]`, sem erro. A linha já existe, foi alterada, foi excluída
  ou a revisão pedida não existe. Buscar a versão remota antes de decidir.
- Sem autenticação: SQLSTATE `42501`. Dados inválidos: `22023`.
- Criação usa revisão esperada `0` e retorna revisão `1`. Uma edição exige a
  revisão confirmada, e retorna a próxima revisão. Não usar upsert cego.
- `p_data` deve ser objeto JSON com `id` igual a `p_id`; o ID tem de 1 a 200 bytes,
  sem espaços nas extremidades; JSON serializado pelo PostgreSQL até 2 MiB.
- Exclusão chama a mesma RPC com `p_deleted: true`, a revisão confirmada e dados
  com o mesmo ID. O conteúdo anterior do servidor é preservado no tombstone.
- Exclusão de ID nunca enviado pode usar revisão `0`, criando tombstone na `1`.
  Um ID excluído não pode ser reutilizado, inclusive pela API direta da tabela.
  Recuperar uma cópia local exige novo UUID, com `data.id` também atualizado.

Consultar todos os registros da conta, inclusive os tombstones, durante a
sincronização. Só ocultar `deleted_at !== null` ao montar a lista visual. Não
interpretar ausência numa página de resposta como exclusão: percorrer a paginação
por completo, ou consultar individualmente um ID conhecido. A chave composta
`(user_id, id)` e RLS mantêm cada conta isolada, mesmo com IDs iguais.

Cada dispositivo deve guardar a última revisão confirmada e a cópia local
pendente, vinculadas ao usuário autenticado. Em conflito, manter ambas as versões
ou criar uma cópia identificável. Não confirmar como salvo enquanto a RPC não
retornar uma linha. Se um pedido tiver sido confirmado no servidor mas a resposta
se perder, buscar e comparar com o estado enviado antes de criar uma duplicata.
Desconectar uma conta não deve enviar pendências dela para outra conta.

## Refúgios

`havens-schema.sql` adiciona `public.trespasser_havens` e a RPC
`public.trespasser_save_haven`, com os mesmos parâmetros, revisões CAS, tombstones,
grants restritos e isolamento por `(user_id, id)`. Além do ID correspondente,
o JSON exige `kind: 'haven'`. A tabela de personagens e o Auth compartilhado
não são alterados. A existência dos arquivos não confirma aplicação no banco.

O cliente seleciona esses nomes na configuração de `createCloudClient` e injeta
o modelo de refúgio no motor comum:

```js
new CloudSync({
  adapter: connection.adapter.forUser(user.id),
  storage: localStorage,
  cacheKey: `trespasser.havens.v1.cloud.${user.id}`,
  normalizeRecord: normalizeHaven,
});
```

Sem `normalizeRecord`, o motor mantém o modelo de personagem. A validação JSON,
os limites de sincronização, a mesclagem de três versões e as cópias de conflito
continuam comuns aos dois modelos. Caches e locks dos refúgios são separados dos
personagens; a conta Google é compartilhada.

`havens-schema-tests.sql` é o equivalente transacional com `ROLLBACK`: cobre quatro
contas, IDs iguais, CAS, RLS, rejeição de `kind` errado/ausente, grants, exclusões e
invariantes. Confere também que a quantidade e a soma das revisões de personagens
permanecem iguais. Executar somente depois de aplicar e verificar os objetos de
refúgio, com conexão administrativa e quatro contas Auth existentes.

## Verificação antes de publicar

Antes de aplicar, inspecionar o projeto aprovado e confirmar que os novos nomes
`trespasser_*` estão livres. O script é transacional e pode ser reaplicado à mesma
estrutura; não faz migrações destrutivas nem adapta silenciosamente uma tabela
incompatível. Grants, funções, políticas e trigger ficam restritos aos novos objetos
com esse prefixo. Não altera tabelas do Biocoded nem configurações de Auth, que são
compartilhadas pelo projeto. Após aplicar, rodar os advisors de segurança e
desempenho do Supabase e distinguir achados novos de achados preexistentes.

`schema-tests.sql` é um teste de integração transacional com `ROLLBACK`. Precisa
de conexão administrativa e quatro contas existentes no Auth. Os IDs são lidos
somente dentro da transação, sem gravá-los no repositório. O teste aborta se não
existirem quatro contas e não escreve em `auth.users`. As claims de JWT simuladas existem só nesta sessão
SQL administrativa, para reproduzir o papel que PostgREST recebe após validar o
token. Não servem como autenticação num cliente público.

O teste cobre criação/edição/CAS, quatro contas com mesmo ID, negação ao anônimo,
ownership forjado, payload inválido, limite de tamanho, exclusão lógica e tentativa
de ressuscitar um tombstone diretamente. Todos os registros de teste são revertidos.

Para concorrência real, em duas conexões autenticadas da mesma conta, ler a mesma
revisão e salvar alterações diferentes simultaneamente. Exatamente uma deve
retornar uma linha, e a outra `[]`. Repetir com exclusão contra edição. Também
validar pelo site em dois perfis de navegador, mais um período offline, login em
outra conta e retorno à primeira. O cliente deve preservar qualquer edição em
conflito e exibir o estado de sincronização real.

## Referências verificadas

- [RLS e políticas com ownership](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Database functions e privilégios](https://supabase.com/docs/guides/database/functions)
- [Segurança da API e grants explícitos](https://supabase.com/docs/guides/api/securing-your-api)
- [Changelog: exposição de tabelas passou a exigir grants explícitos](https://supabase.com/changelog)

Nenhuma função usa `SECURITY DEFINER`. O trigger de invariantes também é
`SECURITY INVOKER`. As permissões da tabela são necessárias para a RPC executada
com o papel do usuário; a API direta só pode operar os registros da própria conta,
sem hard delete e respeitando o mesmo trigger.

## Aplicação e validação dos personagens

Em 19/10/2026, o esquema foi aplicado no Biocoded pelo SQL Editor do dashboard.
O caminho nativo de escrita havia falhado com `Invalid/expired requestState`.
Esta aplicação não criou uma entrada de histórico de migrations; `schema.sql`
continua sendo a fonte revisável do que foi aplicado. Não foi fabricada uma
entrada de histórico para representar a aplicação pelo editor.

Depois da aplicação, `schema-tests.sql` foi executado integralmente pelo conector
SQL, com quatro contas existentes e `ROLLBACK`, sem erros. A consulta posterior
confirmou zero registros persistidos, incluindo zero fixtures `schema-test-*`.
Também confirmou RLS habilitada e forçada, as duas funções com `SECURITY INVOKER`
e `search_path` vazio, acesso autenticado de leitura/RPC e ausência de leitura/RPC
anônima ou permissão de hard delete para o cliente.
Os advisors de segurança e desempenho não apontaram achados para objetos
`trespasser_*`; os achados de outros objetos do projeto compartilhado ficaram
fora desta alteração.

## Aplicação e validação dos refúgios

Em 20/10/2026, `havens-schema.sql` foi aplicado integralmente pelo SQL Editor do
dashboard do projeto Biocoded. O editor retornou `Success. No rows returned`.
A tentativa anterior pelo conector ficou sem resultado e foi interrompida; a
consulta posterior confirmou os objetos ausentes antes da aplicação pelo editor.
Não foi criada uma entrada artificial de histórico de migrations.

Após a aplicação, uma consulta independente pelo conector confirmou a tabela,
RLS habilitada e forçada, as três políticas com ownership pela conta e as duas
funções com `SECURITY INVOKER` e `search_path` vazio. Confirmou leitura e execução
da RPC por `authenticated`, sem leitura/execução anônima, sem hard delete e sem
permissão de alterar `user_id`. A leitura encontrou zero registros e zero fixtures
`haven-schema-test-*`.

Os advisors de segurança e desempenho consultados após a aplicação não apontaram
achados para objetos `trespasser_*`. Os achados em objetos do projeto compartilhado
e no Auth ficaram fora desta alteração.

`havens-schema-tests.sql` foi executado em uma consulta separada no SQL Editor,
sem exceções, terminando em `ROLLBACK`. Os testes cobriram quatro contas existentes,
criação e edição por revisão, conflitos, ownership, acesso anônimo, payloads e
exclusão lógica. Também verificaram que a contagem e a soma de revisões dos
personagens permaneceram iguais. A consulta posterior pelo conector confirmou
zero refúgios e zero fixtures persistidos.
