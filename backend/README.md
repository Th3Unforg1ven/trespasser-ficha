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

## Aplicação e validação

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
