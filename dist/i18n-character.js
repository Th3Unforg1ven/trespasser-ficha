import { getLanguage, registerMessages, t } from './i18n.js';

// Only source-code literals go through this catalog. Interpolated character data
// is appended unchanged, including names which happen to match an interface label.
export const characterMessages = {
  'Personagem':'Character','Combate':'Combat','Equipamento':'Equipment','Anotações':'Journal',
  'Atributos, perícias, saúde e avanço.':'Attributes, skills, health, and advancement.',
  'Defesas, ataques, feitos e estados.':'Defenses, attacks, deeds, and states.',
  'Armas, armadura, itens e inventário.':'Weapons, armor, items, and inventory.',
  'Diário da aventura e registros da mesa.':'Your adventure journal and table notes.',
  'Não foi possível ler o registro local. Exporte esta ficha antes de fechar.':'The local record could not be read. Export this sheet before closing.',
  'Não foi possível guardar a edição · reduza a ficha ou exporte uma cópia':'This edit could not be saved · reduce the sheet size or export a copy',
  'Não foi possível guardar a edição. Use Exportar para preservar esta ficha.':'This edit could not be saved. Use Export to preserve this sheet.',
  'Não foi possível salvar · exporte uma cópia':'Could not save · export a copy',
  'O navegador não conseguiu salvar. Use Exportar para guardar seus dados.':'The browser could not save. Use Export to preserve your data.',
  'Aparência':'Appearance','Tema da ficha':'Sheet theme','Claro':'Light','Modo escuro':'Dark mode','Automático':'Automatic',
  'Automático acompanha o tema do dispositivo. A escolha fica salva neste navegador.':'Automatic follows your device theme. Your choice is saved in this browser.',
  'Conta':'Account','Verificando sua conta…':'Checking your account…',
  'O acesso à conta está indisponível. Suas fichas continuam salvas neste navegador. Recarregue a página para tentar novamente.':'Account access is unavailable. Your sheets remain saved in this browser. Reload to try again.',
  'Entre com a mesma conta no celular e no computador para abrir suas fichas privadas e continuar de onde parou.':'Use the same account on your phone and computer to open your private sheets and pick up where you left off.',
  'Abrindo login…':'Opening sign-in…','Entrar com Google':'Sign in with Google',
  'Sem entrar, as fichas ficam apenas neste navegador. Ao entrar, você poderá salvar suas fichas locais na conta.':'Without signing in, sheets stay in this browser. After signing in, you can save local sheets to your account.',
  'SUA CONTA':'YOUR ACCOUNT','Conta conectada':'Connected account',
  'Suas fichas ficam privadas nesta conta. Entre com o mesmo Google em outro dispositivo para continuar a edição.':'Your sheets are private to this account. Sign in with the same Google account on another device to keep editing.',
  'Sair deste dispositivo':'Sign out on this device','Exportar uma cópia':'Export a copy','Fichas deste navegador':'Sheets in this browser',
  'Há uma ficha local que você pode salvar':'There is one local sheet you can save','Há {count} fichas locais que você pode salvar':'There are {count} local sheets you can save',
  ' na sua conta. A cópia local será mantida.':' to your account. The local copy will be kept.',
  'Salvar minhas fichas locais na conta':'Save my local sheets to my account',
  'Essas edições ainda não foram guardadas. Exporte uma cópia e reduza o conteúdo da ficha antes de sair.':'These edits have not been saved. Export a copy and reduce the sheet content before signing out.',
  'As edições estão somente na memória desta página. Mantenha-a aberta até aparecer “Salvo online” ou exporte uma cópia.':'These edits are only in this page’s memory. Keep it open until “Saved online” appears, or export a copy.',
  'Há alterações pendentes. Se sair agora, elas ficam guardadas neste navegador para sincronizar quando você entrar novamente.':'There are pending changes. If you sign out now, they stay in this browser and sync when you sign in again.',
  'O salvamento é automático. PDF e JSON continuam disponíveis como cópias independentes.':'Saving is automatic. PDFs and JSON files remain available as independent copies.',
  'Configurações':'Settings','Ajustes':'Settings',
  'Guarde seus personagens e refúgios em uma conta e continue a aventura no celular ou no computador.':'Save your characters and havens to an account and continue your adventure on your phone or computer.',
  'Use sua conta Google para entrar. No primeiro acesso, sua conta é criada automaticamente.':'Sign in with your Google account. Your account is created automatically on your first visit.',
  'Verificando seu acesso…':'Checking your access…','O acesso ao Google está indisponível. Recarregue a página para tentar novamente.':'Google sign-in is unavailable. Reload to try again.',
  'Abrindo Google…':'Opening Google…','Continuar com Google':'Continue with Google',
  'Seus registros ficam privados na sua conta. PDF editável e JSON continuam disponíveis para exportar.':'Your records stay private to your account. Fillable PDFs and JSON files remain available to export.',
  'Entrar ou criar conta':'Sign in or create an account','Carregando suas fichas…':'Loading your sheets…',
  'Sincronizando com sua conta…':'Syncing with your account…','Salvo online':'Saved online','Salvo neste navegador':'Saved in this browser',
  'Sincronização pendente · tente novamente':'Sync pending · try again','Sem conexão · alterações pendentes neste navegador':'Offline · pending changes in this browser',
  'Salvo neste dispositivo · sincronização pendente':'Saved on this device · sync pending','Salvamento indisponível · exporte uma cópia':'Saving unavailable · export a copy',
  'Não foi possível abrir esta conta com segurança. Recarregue a página ou use um navegador atualizado.':'This account could not be opened safely. Reload or use an up-to-date browser.',
  'Esta conta está aberta em outra aba. Feche-a e recarregue esta página.':'This account is open in another tab. Close that tab and reload this page.',
  'Este navegador não oferece o bloqueio necessário para editar a conta com segurança. Use um navegador atualizado.':'This browser cannot safely lock the account for editing. Use an up-to-date browser.',
  'Este navegador não permite editar fichas online com segurança entre abas. Use um navegador atualizado.':'This browser cannot safely edit online sheets across tabs. Use an up-to-date browser.',
  'Edições simultâneas preservadas em uma ficha com “(conflito)”. Confira as duas versões.':'Simultaneous edits were preserved in a sheet marked “(conflict)”. Check both versions.',
  'Não foi possível sincronizar. Suas edições ficam neste dispositivo; tente novamente.':'Could not sync. Your edits remain on this device; try again.',
  'A verificação da sessão está demorando. Você pode tentar entrar novamente.':'Session verification is taking a while. You can try signing in again.',
  'Não foi possível verificar sua sessão. Você pode tentar entrar novamente.':'Your session could not be verified. Try signing in again.',
  'Não foi possível abrir o login com Google. Tente novamente.':'Google sign-in could not be opened. Try again.',
  'Você saiu da conta neste dispositivo. As fichas online continuam na sua conta.':'You signed out on this device. Your online sheets remain in your account.',
  'Não foi possível sair agora. Tente novamente.':'Could not sign out. Try again.',
  'As fichas foram copiadas, mas o navegador não conseguiu registrar a transferência.':'The sheets were copied, but the browser could not record the transfer.',
  'Fichas salvas online. A cópia local deste navegador foi mantida.':'Sheets saved online. The local browser copy was kept.',
  'Fichas copiadas; a sincronização está pendente. Mantenha este navegador até aparecer “Salvo online”.':'Sheets copied; sync is pending. Keep this browser open until “Saved online” appears.',
  'Novo personagem':'New character','Nome do personagem':'Character name','Nome':'Name','Jogador':'Player','Registro de personagem':'Character record',
  'Palavras para viver':'Words to live by','Uma convicção, um voto, uma lembrança.':'A conviction, a vow, a memory.',
  'Recursos do personagem':'Character resources','Pontos de vida':'Hit points','Dados de recuperação':'Recovery dice','Resistência':'Endurance','Foco':'Focus','Determinação':'Resolve',
  'Entender {name}':'Understand {name}',
  'Valor atual registrado: {value}.':'Current recorded value: {value}.',
  'Fonte: Trespasser v2.1.3, pp. {pages}.':'Source: Trespasser v2.1.3, pp. {pages}.',
  'Máximo: ({level} + 1) × (5 + {might}) + {bonus} = {total} PV.':'Maximum: ({level} + 1) × (5 + {might}) + {bonus} = {total} HP.',
  'O máximo cresce com o nível e Might. Dez é apenas a base de um personagem de nível 1 com Might 0 e sem ajustes.':'The maximum grows with level and Might. Ten is only the base for a level 1 character with Might 0 and no adjustments.',
  'Bônus de vocação, como Fortitude, talentos, itens e efeitos entram em Combate → Ajustes de regras → PV máximos. Alterar nível, atributos ou ajustes recalcula o máximo, sem restaurar os PV atuais.':'Enter calling bonuses such as Fortitude, talents, items, and effects under Combat → Bonuses & overrides → Maximum HP. Changing level, attributes, or adjustments recalculates the maximum without restoring current HP.',
  'No nível 0, o Commoner tem 5 + Might PV. Chegar a 0 PV causa morte imediata, sem teste de Tenacity; recupera PV com descanso de uma semana.':'At level 0, a Commoner has 5 + Might HP. Reaching 0 HP causes immediate death without a Tenacity check; HP is regained with a week’s rest.',
  'Resolve é um recurso de trespassers (p. 44). Este registro o habilita a partir do nível 1.':'Resolve is a resource for trespassers (p. 44). This record enables it from level 1 onward.',
  'Commoners de nível 0 não têm Endurance, dados de recuperação ou Focus. Esses recursos são habilitados a partir do nível 1.':'Level 0 Commoners have no Endurance, recovery dice, or Focus. These resources are enabled from level 1 onward.',
  'Os valores salvos são preservados ao mudar de nível; a ficha não os restaura automaticamente.':'Saved values are preserved when changing level; the sheet does not restore them automatically.',
  'Disponíveis: {current} de {total} dados {die}.':'Available: {current} of {total} {die} dice.',
  'O total é uma reserva diária: após o descanso noturno, você perde os dados restantes e recebe tantos dados quanto sua Endurance atual. O tamanho de cada dado é seu Skill die.':'The total is a daily pool: after a night’s rest, you lose any remaining dice and receive a number equal to your current Endurance. Each die is the size of your Skill die.',
  'A reserva registrada é {total}; a Endurance atual é {endurance}. Reduzir Endurance durante o dia não altera retroativamente essa reserva.':'The recorded pool is {total}; current Endurance is {endurance}. Losing Endurance during the day does not retroactively resize this pool.',
  'Use Combate → Descanso noturno para renovar a reserva depois de resolver o descanso na mesa. Para corrigir um registro, use Combate → Ajustes de regras → Total de dados de recuperação. Com Endurance 0, o descanso noturno não recupera PV nem dados.':'Use Combat → Night’s rest to renew the pool after resolving the rest at the table. To correct a record, use Combat → Bonuses & overrides → Total recovery dice. At 0 Endurance, a night’s rest restores neither HP nor dice.',
  'Máximo: 10 + Spirit {spirit} + ajuste {bonus} = {total}.':'Maximum: 10 + Spirit {spirit} + adjustment {bonus} = {total}.',
  'Endurance diminui com fome, esforço, magia e outros perigos. O descanso noturno usa a Endurance restante para renovar os dados de recuperação; não restaura a própria Endurance.':'Endurance decreases through hunger, exertion, magic, and other dangers. A night’s rest uses remaining Endurance to renew recovery dice; it does not restore Endurance itself.',
  'Uma semana de descanso no refúgio restaura Endurance, PV e dados de recuperação. Registre essa recuperação depois de resolvê-la na mesa. Ajustes adicionais ficam em Combate → Ajustes de regras → Endurance máx.':'A week’s rest in your haven restores Endurance, HP, and recovery dice. Record that recovery after resolving it at the table. Additional adjustments are under Combat → Bonuses & overrides → Maximum Endurance.',
  'Início do combate: Skill {skill} + ajuste {bonus} = {total} Focus.':'Starting combat: Skill {skill} + adjustment {bonus} = {total} Focus.',
  'O livro não define um máximo de Focus: você pode ganhar mais durante o combate. O valor inicial não é um limite, e o excesso não é levado para o combate seguinte.':'The book sets no maximum for Focus: you can gain more during combat. The starting value is not a limit, and excess Focus does not carry over to the next fight.',
  'Use Combate → Iniciar combate depois de ter um ou dois minutos para recuperar o fôlego. Esse botão prepara o Focus inicial, mantendo as marcas de custo dos feitos. Ajustes do valor inicial ficam em Combate → Ajustes de regras → Foco inicial.':'Use Combat → Start combat after a minute or two to catch your breath. This prepares starting Focus and keeps the deed cost marks. Adjust the starting value under Combat → Bonuses & overrides → Starting Focus.',
  'Ao terminar seu turno sem tentar um feito heavy, mighty ou special, ganhe Focus igual ao Skill bonus. Atualize esse ganho na ficha conforme a mesa. Skill: +2 nos níveis 0–2, +3 em 3–5, +4 em 6–8 e +5 no nível 9.':'When you end your turn without attempting a heavy, mighty, or special deed, gain Focus equal to your Skill bonus. Update that gain in the sheet as resolved at the table. Skill: +2 at levels 0–2, +3 at 3–5, +4 at 6–8, and +5 at level 9.',
  'Máximo: 3 Resolve.':'Maximum: 3 Resolve.',
  'O limite de três é uma regra fixa. Você pode ganhar Resolve no início do dia com Endurance abaixo da metade, por ferimentos, ao presenciar a morte de um aliado ou por uma striking success de um aliado, conforme a mesa.':'The limit of three is a fixed rule. You may gain Resolve at the start of the day with Endurance below half, from injuries, when you witness an ally die, or from an ally’s striking success, as resolved at the table.',
  'Uma vez por turno, gaste 1 Resolve para obter 1 AP extra, ganhar 2 Focus ou tentar um segundo feito. Após a primeira semana de descanso ao retornar ao refúgio, Resolve volta a 0. Registre esses ganhos e gastos manualmente.':'Once per turn, spend 1 Resolve to gain 1 extra AP, gain 2 Focus, or attempt a second deed. After the first week’s rest upon returning to your haven, Resolve resets to 0. Record these gains and spends manually.',
  'Diminuir {name}':'Decrease {name}','Aumentar {name}':'Increase {name}','{name} atuais':'Current {name}','atual':'current',
  'Atributo-chave':'Key attribute','{name} é atributo-chave':'{name} is the key attribute',
  'Traço {number}':'Trait {number}','Convicção ou ideal':'Conviction or ideal','Negar':'Deny','Afirmar':'Affirm','Negar traço {number}: {count}':'Deny trait {number}: {count}','Afirmar traço {number}: {count}':'Affirm trait {number}: {count}',
  'Atributos & perícias':'Attributes & skills','ATRIBUTO':'ATTRIBUTE','VALOR':'VALUE','CHAVE':'KEY','Proficiência':'Skill bonus','Dado de perícia':'Skill die','Explorar':'Explore','Encontro':'Encounter',
  'Nível 0: Precisão usa o maior entre Força e Agilidade.':'Level 0: Accuracy uses the higher of Might and Agility.',
  '◆ Marque seu atributo-chave para calcular a Precisão.':'◆ Select your key attribute to calculate Accuracy.',
  'Saúde & ferimentos':'Health & injuries','Aflições':'Plights','Aflições e condições persistentes.':'Plights and persistent conditions.','Ferimento {number}':'Injury {number}','Ferimento':'Injury','Relógio':'Clock',
  'Características & talentos':'Features & talents','Características, habilidades e benefícios':'Features, abilities, and benefits','Talentos, habilidades de linhagem e benefícios da vocação.':'Talents, lineage abilities, and calling benefits.',
  'Avanço':'Advancement','Nível':'Level','Experiência':'Experience','Próximo nível':'Next level','Após o Primeiro Dia':'After the First Day','Nível máximo':'Maximum level','Linhagem':'Lineage','Vida passada':'Past life','Vocação':'Calling','Ofícios':'Crafts',
  'Altere o nível após gastar a experiência e escolher os benefícios do avanço.':'Change your level after spending XP and choosing your advancement benefits.','Alinhamento':'Alignment',
  'Iniciativa':'Initiative','Precisão':'Accuracy','Guarda':'Guard','Resistir':'Resist','Prevalecer':'Prevail','Tenacidade':'Tenacity',
  'Maior entre MGT/AGI + Skill':'Higher of MGT/AGI + Skill','Atributo-chave + Skill':'Key attribute + Skill','Armadura ≥ 6: sem Agility':'Armor ≥ 6: no Agility',
  'ROTINAS DE COMBATE':'COMBAT ROUTINES','Prepare o foco ou registre o descanso concluído.':'Prepare Focus or record a completed rest.','Iniciar combate':'Start combat','Descanso noturno':'Night rest',
  'Movimento & ataque':'Movement & attack','Velocidade':'Speed','quadrados · bônus ':'squares · bonus ','Rolar dado':'Roll die','Mão principal':'Main hand','Mão secundária':'Off hand',
  'Sem arma registrada':'No weapon recorded','Dano não definido':'Damage not set','Rolar dano':'Roll damage','Ataques e efeitos são resolvidos na mesa. Registre ajustes temporários abaixo.':'Resolve attacks and effects at the table. Record temporary adjustments below.',
  'Ferimentos & aflições':'Injuries & plights','Aflições · Plights':'Plights','Fome, sede, exaustão ou outras aflições.':'Hunger, thirst, exhaustion, or other plights.','Descreva o ferimento':'Describe the injury',
  'Feitos':'Deeds','Registre seus feitos. O custo crescente continua entre combates.':'Record your deeds. Their increasing cost carries over between combats.','Adicionar feito':'Add deed','Nome do feito':'Deed name','Excluir feito {number}':'Delete deed {number}',
  'Categoria':'Category','Leve · Light':'Light','Pesado · Heavy':'Heavy','Poderoso · Mighty':'Mighty','Especial · Special':'Special','Custo base':'Base cost','Marcas de foco':'Focus marks','Efeito / notas':'Effect / notes','Ação, alvo, alcance, acerto e spark.':'Action, target, range, hit, and spark.',
  'Usar · {count} foco':'Use · {count} Focus','Nenhum feito registrado':'No deeds recorded','Adicione um feito e registre seu custo e efeito.':'Add a deed and record its cost and effect.',
  'Estados':'States','Intensidade 0 = inativo. Os estados ficam registrados; aplique seus efeitos na mesa ou nos ajustes.':'Intensity 0 = inactive. States are recorded here; apply their effects at the table or through adjustments.',
  'Ajustes de regras':'Bonuses & overrides','Bônus de vocação, talentos, itens e efeitos':'Calling, talent, item, and effect bonuses',
  'Valores somados aos cálculos básicos. Inclua aqui o bônus de PV da vocação (Fortitude). Alterar máximos não restaura recursos atuais.':'These values are added to the base calculations. Include your calling’s HP bonus (Fortitude) here. Changing maximums does not restore current resources.',
  'PV máximos':'Maximum HP','Endurance máx.':'Maximum Endurance','Velocidade base':'Base Speed','Foco inicial':'Starting Focus','Total de dados de recuperação':'Total recovery dice',
  'Cabeça · Head':'Head','Corpo · Body':'Body','Braços · Arms':'Arms','Pernas · Legs':'Legs','Cobertura · Outer':'Outer','Escudo · Shield':'Shield',
  'Armas':'Weapons','MÃO PRINCIPAL · MAIN HAND':'MAIN HAND','MÃO SECUNDÁRIA · OFF HAND':'OFF HAND','Arma':'Weapon','Nome da arma':'Weapon name','Dados de dano':'Damage dice','Ex.: 2d6':'e.g. 2d6','Tipo & alcance':'Type & range','Tipo e alcance':'Type and range','Propriedades':'Properties',
  'Armadura':'Armor','Armadura total':'Total armor rating','Carga pesada · AR ≥ 6':'Encumbered · AR ≥ 6','Sem penalidade de armadura':'No armor penalty',
  'L = leve, H = pesada. Peças pesadas: ':'L = light, H = heavy. Heavy pieces: ',' permitidas por Might. ':' allowed by Might. ',
  'Confira a carga: há peças pesadas além do limite. ':'Check your load: heavy pieces exceed the limit. ','Armas e armaduras equipadas não ocupam espaços do inventário.':'Equipped weapons and armor do not use inventory slots.',
  'Posição / peça':'Slot / piece','Peso':'Weight','Dado':'Die','Gasto':'Spent','Dado de armadura gasto: ':'Armor die spent: ','Efeito da peça':'Piece effect',
  'Itens mágicos':'Magic items','AMULETO · AMULET':'AMULET','ANEL · RING':'RING','TALISMÃ · TALISMAN':'TALISMAN','Item':'Item','Nome do item':'Item name','Efeito':'Effect','Propriedades e efeito mágico.':'Properties and magical effect.',
  'Inventário':'Inventory','espaços ocupados':'slots used','Moedas · cp / sp / gp':'Coins · cp / sp / gp','Ex.: 25 cp, 2 sp':'e.g. 25 cp, 2 sp','Adicionar item':'Add item','A capacidade foi excedida. Confira a carga com o Judge.':'Capacity exceeded. Check your load with the Judge.','O que você carrega?':'What are you carrying?','Espaços':'Slots','Notas':'Notes','Quantidade, uso, detalhes…':'Quantity, use, details…','Excluir item {number}':'Delete item {number}','Inventário vazio':'Empty inventory','Adicione itens e os espaços que ocupam.':'Add items and the slots they use.',
  'Diário de viagem':'Journal','Anotações da aventura':'Adventure notes','Pessoas que encontrou. Promessas que fez. Lugares aos quais talvez volte.':'People you met. Promises you made. Places you may return to.',
  'Sua ficha online':'Your online sheet','Continue em outro dispositivo':'Continue on another device',
  'As alterações são sincronizadas com sua conta. Entre com o mesmo Google no celular e no computador para acessar esta ficha.':'Changes sync with your account. Sign in with the same Google account on your phone and computer to access this sheet.',
  'Use Entrar para salvar suas fichas na conta e continuar no celular ou no computador. Sem entrar, elas ficam neste navegador.':'Sign in to save your sheets to your account and continue on your phone or computer. Without signing in, they stay in this browser.',
  'Entrar para salvar online':'Sign in to save online','Cópia da ficha':'Sheet backup',
  'Exportar baixa um ZIP com o PDF preenchível e o JSON da ficha. O PDF mantém campos editáveis; o JSON permite reabrir o personagem neste site. Alterações nos arquivos são independentes. Use a impressão para levar uma cópia em papel.':'Export downloads a ZIP containing the fillable PDF and the sheet’s JSON. The PDF remains editable; JSON lets you reopen the character on this site. Changes to those files are independent. Print to take a paper copy.',
  'Exportar PDF + JSON':'Export PDF + JSON','Preparando exportação':'Preparing export',
  'Gerando o PDF preenchível e o JSON de ':'Generating the fillable PDF and JSON for ',
  'O download será um ZIP com os dois arquivos. Você também poderá baixá-los separadamente.':'The download is a ZIP containing both files. You can also download them separately.',
  'Baixar PDF editável':'Download fillable PDF','Baixar JSON':'Download JSON','Baixar ZIP novamente':'Download ZIP again','PDF + JSON prontos':'PDF + JSON ready',
  'O ZIP com o PDF preenchível e o JSON está pronto. Se o download não começar, use o link abaixo.':'The ZIP with your fillable PDF and JSON is ready. If the download does not start, use the link below.',
  'O PDF mantém seus campos editáveis. Importe o JSON neste site para reabrir o personagem. Alterações no PDF, no JSON e na ficha do navegador não são sincronizadas.':'The PDF keeps its editable fields. Import the JSON on this site to reopen your character. Changes to the PDF, JSON, and browser sheet do not sync with each other.',
  'PDF preenchível e JSON preparados no ZIP.':'Fillable PDF and JSON prepared in the ZIP.','Arquivos prontos. Use Baixar ZIP novamente para iniciar o download.':'Files ready. Use Download ZIP again to start the download.',
  'Não foi possível gerar o PDF':'Could not generate PDF','Baixar JSON de backup':'Download JSON backup','A exportação do PDF não foi concluída.':'PDF export did not complete.','Motivo: ':'Reason: ',
  'Não foi possível carregar o modelo do PDF. Tente novamente.':'Could not load the PDF template. Try again.',
  'O caractere “{character}” não é suportado pela fonte do PDF. O JSON preserva o texto completo.':'The character “{character}” is not supported by the PDF font. JSON preserves the full text.',
  '{field}: objeto inválido.':'{field}: invalid object.','{field}: texto inválido.':'{field}: invalid text.','{field}: número inválido.':'{field}: invalid number.','{field}: lista inválida.':'{field}: invalid list.',
  'Bônus {field}':'{field} bonus','Recurso {field}':'{field} resource',
  'Seus dados continuam na ficha; baixe o JSON de backup e tente exportar novamente.':'Your data remains in the sheet; download the JSON backup and try exporting again.',
  'O JSON permite reabrir este personagem pela opção Importar.':'JSON lets you reopen this character using Import.',
  'Não foi possível preparar a exportação. Seus dados continuam na ficha. Tente novamente.':'Could not prepare the export. Your data remains in the sheet. Try again.',
  'Foco insuficiente para este feito.':'Not enough Focus for this deed.','Feito usado: {count} foco gasto.':'Deed used: {count} Focus spent.',
  'Commoners não usam foco.':'Commoners do not use Focus.','Definir o foco para ':'Set Focus to ',' (Skill + ajustes)? As marcas de foco dos feitos continuam registradas.':' (Skill + adjustments)? Deed Focus marks are kept.',
  'Foco inicial preparado.':'Starting Focus prepared.','A recuperação de Commoners é resolvida com o Judge.':'Resolve Commoner recovery with the Judge.',
  'Depois de resolver o descanso na mesa, restaure seus PV, renove os dados de recuperação conforme a Endurance restante, apague as marcas de foco dos feitos e recupere os dados de armadura.':'After resolving the rest at the table, restore HP, renew recovery dice according to your remaining Endurance, clear deed Focus marks, and recover armor dice.',
  'Consegui me alimentar':'I was able to eat','Se não conseguiu comer, perde 1 Endurance.':'If you could not eat, lose 1 Endurance.',
  'Com Endurance 0, não há recuperação de PV nem ganho de dados de recuperação. Recursos de foco e Resolve continuam como estão.':'At 0 Endurance, you do not recover HP or gain recovery dice. Focus and Resolve remain unchanged.',
  'Aplicar descanso concluído':'Apply completed rest','Descanso registrado. Resolva aflições e ferimentos com o Judge.':'Rest recorded. Resolve plights and injuries with the Judge.',
  ' (cópia)':' (copy)','Cópia criada.':'Copy created.','Excluir personagem':'Delete character','Excluir ':'Delete ',
  'da sua conta e dos dispositivos sincronizados':'from your account and synced devices','deste navegador':'from this browser',
  '? Essa ação não pode ser desfeita. Você pode exportar uma cópia antes.':'? This cannot be undone. You can export a copy first.',
  'Exportar ficha':'Export sheet','Personagem excluído.':'Character deleted.','Nova ficha criada. Escolha o nível e preencha seus atributos.':'New sheet created. Choose a level and fill in your attributes.',
  'O arquivo deve ter até 2 MB.':'The file must be no larger than 2 MB.','Use um JSON exportado por esta ficha (versão 1).':'Use a JSON exported by this sheet (version 1).','Ficha importada como um novo personagem.':'Sheet imported as a new character.','Não foi possível importar: ':'Could not import: ',
  'Gerenciar ficha':'Manage sheet','Organize seus personagens. Exportar prepara um ZIP com o PDF preenchível e o JSON para backup ou transferência.':'Organize your characters. Export prepares a ZIP with the fillable PDF and JSON for backup or transfer.','Duplicar personagem':'Duplicate character',
  'Sobre este registro':'About this record','Ferramenta não oficial baseada no Rulebook e Character Record de ':'Fan-made tool based on the Rulebook and Character Record for ',
  '. Traduções de interface são livres; os termos em inglês ajudam a consultar o livro.':'. Portuguese interface translations are unofficial; English terms help you consult the book.',
  'Cálculos':'Calculations','Os atributos, nível, perícias e AR alimentam os valores da ficha. Vocação, talentos e efeitos específicos exigem ajustes manuais em Combate. Estados e aflições são registros; seus efeitos precisam ser resolvidos na mesa.':'Attributes, level, skills, and AR determine sheet values. Calling, talents, and specific effects require manual adjustments under Combat. States and plights are recorded here; resolve their effects at the table.',
  'PV: (nível + 1) × (5 + Might), mais o ajuste de PV. Endurance: 10 + Spirit. AR ≥ 6 remove Agility da Guarda e limita o bônus de velocidade a +2. Commoners não usam Endurance, recuperação ou foco.':'HP: (level + 1) × (5 + Might), plus the HP adjustment. Endurance: 10 + Spirit. AR ≥ 6 removes Agility from Guard and caps the Speed bonus at +2. Commoners do not use Endurance, recovery, or Focus.',
  'Seus dados':'Your data','Entre com Google para salvar suas fichas privadas na conta e acessar os mesmos personagens no celular e no computador. O salvamento é automático; confira o indicador “Salvo online”. Sem conexão, as alterações ficam pendentes neste navegador e são enviadas quando a conexão volta. Edições simultâneas conflitantes são preservadas em uma cópia com “(conflito)”.':'Sign in with Google to save private sheets to your account and access the same characters on your phone and computer. Saving is automatic; check for “Saved online”. Offline edits stay pending in this browser and upload when the connection returns. Conflicting simultaneous edits are preserved in a copy marked “(conflict)”.',
  'Sem entrar, o salvamento continua local. As fichas locais podem ser copiadas para a conta pela opção Configurações. Ao sair, você volta às fichas locais; as fichas da conta continuam privadas. Limpar os dados do navegador apaga cópias locais e alterações ainda não sincronizadas.':'Without signing in, saving remains local. Local sheets can be copied to your account from Settings. Signing out returns you to local sheets; account sheets stay private. Clearing browser data deletes local copies and unsynced edits.',
  'Exportar baixa um ZIP com o PDF preenchível e o JSON da ficha; também oferece os arquivos separados. Alterações nesses arquivos são independentes da ficha online. Importar o JSON cria uma nova ficha.':'Export downloads a ZIP containing the fillable PDF and sheet JSON; separate downloads are also available. Changes to those files are independent of the online sheet. Importing JSON creates a new sheet.',
  'Referências do livro: pp. 11–12, 19, 22–24, 31, 44–45, 55, 63, 71, 75, 86, 88–90. A impressão inclui todas as seções da ficha; use Exportar para gerar o PDF preenchível.':'Book references: pp. 11–12, 19, 22–24, 31, 44–45, 55, 63, 71, 75, 86, 88–90. Printing includes every sheet section; use Export for a fillable PDF.',
  'Rolagem de dados':'Dice roll','Rolagem livre. Para testes: d20 + atributo + Skill bonus quando a perícia é treinada. Compare com o TN anunciado na mesa.':'Free-form rolls. For checks: d20 + attribute + Skill bonus when trained in the skill. Compare with the TN announced at the table.',
  'Expressão de dados':'Dice expression','Ex.: 1d20+3':'e.g. 1d20+3','Rolar dados':'Roll dice','RESULTADO':'RESULT',' · dados: ':' · dice: ',
  'Trespasser · Ficha de personagem':'Trespasser · Character sheet','O registro mudou em outra aba':'The record changed in another tab',
  'Outra aba alterou os personagens. Recarregue para ler os dados mais recentes antes de continuar. Exporte esta ficha se quiser preservar a edição atual.':'Another tab changed the characters. Reload to read the latest data before continuing. Export this sheet to preserve the current edit.',
  'Exportar esta versão':'Export this version','Carregar versão recente':'Load latest version','Alteração em outra aba · recarregue':'Changed in another tab · reload',
  'Ir para o conteúdo':'Skip to content','Trespasser · Personagens e Refúgios':'Trespasser · Characters and Havens',' · Personagens e Refúgios':' · Characters and Havens',
  'Relógio · Clock':'Clock','Retrato do personagem':'Character portrait','Editar retrato':'Edit portrait','Ajustar retrato':'Adjust portrait','Adicionar retrato':'Add portrait','Remover retrato':'Remove portrait','Trocar imagem':'Change image','Escolher imagem':'Choose image',
  'Escolha uma imagem para ajustar o enquadramento antes de salvar.':'Choose an image to adjust its framing before saving.',
  'O retrato será removido ao salvar. Você também pode escolher outra imagem.':'Saving will remove the portrait. You can also choose another image.',
  'Ajuste o zoom e a posição para enquadrar seu personagem.':'Adjust zoom and position to frame your character.',
  'Posição horizontal':'Horizontal position','Posição vertical':'Vertical position','PNG, JPEG ou WebP, até 12 MB. A imagem é reduzida e salva com a ficha.':'PNG, JPEG, or WebP, up to 12 MB. The image is resized and saved with your sheet.',
  'Salvar retrato':'Save portrait','Cancelar':'Cancel','Retrato salvo.':'Portrait saved.','Retrato removido.':'Portrait removed.','Preparando retrato':'Preparing portrait','Preparando sua imagem…':'Preparing your image…',
  'Não foi possível abrir a imagem':'Could not open image','Escolha uma imagem PNG, JPEG ou WebP.':'Choose a PNG, JPEG, or WebP image.','Escolher outra imagem':'Choose another image',
  'Retrato inválido. Use uma imagem PNG, JPEG ou WebP.':'Invalid portrait. Use a PNG, JPEG, or WebP image.','A imagem é grande demais. Escolha uma imagem menor.':'The image is too large. Choose a smaller image.',
  'Enquadramento do retrato inválido.':'Invalid portrait crop.','Dimensões do retrato inválidas.':'Invalid portrait dimensions.','Não foi possível preparar o retrato neste navegador.':'Could not prepare the portrait in this browser.','Não foi possível reduzir a imagem. Escolha uma imagem menor.':'Could not resize the image. Choose a smaller image.',
  'Aflições comuns do livro, p. 58. Marque as aflições atuais e resolva seus efeitos na mesa.':'Common plights from the book, p. 58. Mark current plights and resolve their effects at the table.','Anotações anteriores':'Previous notes',
  'Sorteio seguro indisponível neste navegador.':'Secure dice rolls are unavailable in this browser.','Expressão de dados inválida.':'Invalid dice expression.','Use uma expressão como 1d20+3 ou 2d6.':'Use an expression such as 1d20+3 or 2d6.','Modificador grande demais.':'Modifier is too large.','Use até 100 dados, com 1 a 1000 faces.':'Use up to 100 dice, with 1 to 1000 sides.',
  'Aflição inválida.':'Invalid plight.','Atributo-chave inválido.':'Invalid key attribute.','Perícia inválida.':'Invalid skill.','Posição de armadura inválida ou repetida.':'Invalid or duplicate armor slot.','Dado de armadura inválido.':'Invalid armor die.','Posição de item mágico inválida ou repetida.':'Invalid or duplicate magic item slot.','Tipo de façanha inválido.':'Invalid deed kind.','Estados demais.':'Too many states.','Estado inválido.':'Invalid state.',
  'Não foi possível salvar a cópia neste navegador. Mantenha a página aberta até a sincronização terminar ou exporte a ficha.':'Could not save the copy in this browser. Keep the page open until syncing finishes, or export the sheet.',
  'Não foi possível ler a cópia deste navegador.':'Could not read the copy saved in this browser.','A cópia deste navegador está inválida. A versão da nuvem será consultada; os dados anteriores foram mantidos para recuperação.':'The browser copy is invalid. The cloud version will be checked; earlier data was kept for recovery.',
  'Ficha salva online. A cópia deste navegador está indisponível.':'Sheet saved online. The browser copy is unavailable.','Ainda há alterações pendentes. A próxima sincronização tentará novamente.':'Some changes are still pending. The next sync will try again.',
  'Não foi possível sincronizar nem salvar neste navegador. Mantenha a página aberta ou exporte a ficha.':'Could not sync or save in this browser. Keep the page open or export the sheet.',
  'Sua sessão precisa ser renovada para sincronizar. As alterações continuam salvas neste navegador.':'Your session needs to be renewed to sync. Changes remain saved in this browser.',
  'Não foi possível acessar a nuvem. As alterações ficam salvas neste navegador e serão enviadas ao reconectar.':'Could not reach the cloud. Changes stay saved in this browser and upload when you reconnect.',
  'A ficha foi excluída em outro dispositivo. Suas alterações foram preservadas em uma cópia com “(conflito)”.':'The sheet was deleted on another device. Your edits were preserved in a copy marked “(conflict)”.',
  'Encontramos outra versão desta ficha. A versão deste dispositivo foi preservada com “(conflito)”.':'Another version of this sheet was found. This device’s version was preserved with “(conflict)”.',
  'A ficha que você excluiu recebeu alterações em outro dispositivo e foi restaurada para preservar esses dados.':'The sheet you deleted was edited on another device and was restored to preserve those edits.',
  'Dois dispositivos alteraram o mesmo campo. Suas alterações foram preservadas em uma cópia com “(conflito)”.':'Two devices changed the same field. Your edits were preserved in a copy marked “(conflict)”.',
  'A ficha anterior não foi encontrada na nuvem. A cópia deste dispositivo foi preservada com “(conflito)”.':'The previous sheet was not found in the cloud. This device’s copy was preserved with “(conflict)”.',
  'A exclusão já tinha sido enviada. A ficha reaberta foi preservada em uma cópia com “(conflito)”.':'Deletion was already sent. The reopened sheet was preserved in a copy marked “(conflict)”.',
  'Esta ficha já foi excluída na nuvem. As alterações foram preservadas em uma cópia com “(conflito)”.':'This sheet was already deleted in the cloud. Edits were preserved in a copy marked “(conflict)”.',
  'Voltar à tela inicial':'Back to home','Trocar personagem':'Switch character','Criar personagem':'Create character','Novo':'New','Dados':'Dice','Imprimir ficha':'Print sheet','Exportar PDF preenchível e JSON':'Export fillable PDF and JSON','Imprimir':'Print','REGISTRO':'RECORD','Seções da ficha':'Sheet sections','A pessoa por trás da aventura.':'The person behind the adventure.','Cálculos & salvamento':'Calculations & saving','Abrindo seu registro…':'Opening your record…','Fan-made por':'Fan-made by','Refúgios':'Havens',
};
registerMessages(characterMessages);

const literalSources=Object.keys(characterMessages).sort((a,b)=>b.length-a.length);
const escapePattern=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const literalPattern=new RegExp(literalSources.map(escapePattern).join('|'),'g');
export function ui(strings,...values) {
  return strings.reduce((result,source,index)=>{
    if(getLanguage()==='en'){
      source=source.replace(/([^<>]*?)\s*<small>([^<>]+)<\/small>/g,(whole,pt,en)=>{
        const value=pt.trim();
        return Object.hasOwn(characterMessages,value)&&!/[0-9+]/.test(en)?`${pt.startsWith(' ')?' ':''}${en}`:whole;
      }).replace(/([^<>]*?)<br><small>([^<>]+)<\/small>/g,(whole,pt,en)=>Object.hasOwn(characterMessages,pt.trim())?en:whole);
      source=source.replace(literalPattern,match=>characterMessages[match]);
    }
    return result+source+(index<values.length?values[index]:'');
  },'');
}
export function bilingual(pt,en) {return getLanguage()==='en'?en:`${pt}${en?` <small>${en}</small>`:''}`;}
export function label(source) {
  const match=String(source).match(/^(.*?)\s*<small>(.*?)<\/small>$/s);
  if(match)return bilingual(match[1],match[2]);
  return t(source);
}

const errorFields=Object.freeze({
  Ficha:'Sheet',Texto:'Text',Nível:'Level',XP:'XP',Atributos:'Attributes','Atributo-chave':'Key attribute',Perícias:'Skills',Bônus:'Bonuses',Recursos:'Resources',
  Alinhamentos:'Alignments',Alinhamento:'Alignment',Afirmações:'Affirmations',Negações:'Denials',Ferimentos:'Injuries',Ferimento:'Injury',Relógio:'Clock',Aflições:'Plights',
  Inventário:'Inventory',Item:'Item','Espaços do item':'Item slots',Armas:'Weapons',Arma:'Weapon',Armaduras:'Armor pieces',Armadura:'Armor',Proteção:'Armor rating',
  'Itens mágicos':'Magic items','Item mágico':'Magic item',Façanhas:'Deeds',Façanha:'Deed',Custo:'Cost','Custo crescente':'Increasing cost',Estados:'States',Intensidade:'Intensity',
  id:'ID',name:'Name',player:'Player',motto:'Words to live by',lineage:'Lineage',pastLife:'Past life',calling:'Calling',crafts:'Crafts',plights:'Plights',features:'Features',notes:'Notes',coins:'Coins',
  might:'Might',agility:'Agility',intellect:'Intellect',spirit:'Spirit',hp:'HP',endurance:'Endurance',recovery:'Recovery dice',recoveryTotal:'Total recovery dice',focus:'Focus',resolve:'Resolve',
  guard:'Guard',accuracy:'Accuracy',initiative:'Initiative',resist:'Resist',prevail:'Prevail',tenacity:'Tenacity',speed:'Speed',
});
const bonusErrorFields=new Set(['hp','endurance','guard','accuracy','initiative','resist','prevail','tenacity','speed','focus']);
const resourceErrorFields=new Set(['hp','endurance','recovery','recoveryTotal','focus','resolve']);

/** Translate known diagnostics, never a general replacement over character text. */
export function formatError(source) {
  const text=String(source??'');
  if(getLanguage()!=='en')return text;
  const exact=t(text);
  if(exact!==text)return exact;
  const unsupported=text.match(/^O caractere “([\s\S])” não é suportado pela fonte do PDF\. O JSON preserva o texto completo\.$/u);
  if(unsupported)return t('O caractere “{character}” não é suportado pela fonte do PDF. O JSON preserva o texto completo.',{character:unsupported[1]});
  const invalid=text.match(/^(.+): (objeto|texto|número|lista) inválid[oa]\.$/u);
  if(!invalid)return text;
  let field=Object.hasOwn(errorFields,invalid[1])?errorFields[invalid[1]]:undefined;
  if(!field){
    const dynamic=invalid[1].match(/^(Bônus|Recurso) ([A-Za-z]+)$/);
    if(dynamic&&(dynamic[1]==='Bônus'?bonusErrorFields:resourceErrorFields).has(dynamic[2]))field=t(`${dynamic[1]} {field}`,{field:errorFields[dynamic[2]]});
  }
  return field?t(`{field}: ${invalid[2]} ${invalid[2]==='lista'?'inválida':'inválido'}.`,{field}):text;
}
