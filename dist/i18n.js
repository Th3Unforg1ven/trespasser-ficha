// Interface language is separate from character/haven data and from account sync.
export const LANGUAGE_KEY = 'trespasser.language.v1';
const catalog = new Map();
const controllers = new WeakMap();
let language = 'pt', preference = 'system', activeController;
const valid = value => ['system','pt','en'].includes(value);
export function registerMessages(messages) {
  for (const [source,translated] of Object.entries(messages || {})) {
    if (typeof translated === 'string') catalog.set(source,translated);
  }
}
export const getLanguage = () => language;
export const getLanguagePreference = () => preference;
export function detectLanguage(navigator) {
  const primary = navigator?.language || navigator?.languages?.[0] || 'en';
  return /^pt(?:-|$)/i.test(primary) ? 'pt' : 'en';
}
export function t(source,params = {}) {
  const result = language === 'en' ? catalog.get(String(source)) ?? String(source) : String(source);
  return result.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g,(match,key)=>Object.hasOwn(params,key) ? String(params[key]) : match);
}
export function setLanguagePreference(value) {
  if (!valid(value)) return;
  if (activeController) activeController.setPreference(value);
  else {preference=value;language=value === 'system' ? 'pt' : value;}
}
export function translateStatic(root = globalThis.document) {
  if (!root?.querySelectorAll) return;
  const translate = element => {
    if (element.hasAttribute?.('data-i18n')) element.textContent=t(element.getAttribute('data-i18n'));
    for (const attribute of ['title','aria-label','placeholder']) {
      const source=element.getAttribute?.(`data-i18n-${attribute}`);
      if(source !== null && source !== undefined) element.setAttribute(attribute,t(source));
    }
  };
  if(root.matches?.('[data-i18n],[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder]'))translate(root);
  root.querySelectorAll('[data-i18n],[data-i18n-title],[data-i18n-aria-label],[data-i18n-placeholder]').forEach(translate);
}
export function languageSettingsMarkup() {
  return `<section class="settings-section settings-language"><h3>${t('Idioma')}</h3><label class="field"><span>${t('Idioma da interface')}</span><select data-language-preference aria-label="${t('Idioma da interface')}">${[['system',t('Automático (dispositivo)')],['pt','Português'],['en','English']].map(([value,label])=>`<option value="${value}"${preference===value?' selected':''}>${label}</option>`).join('')}</select></label><p class="panel-note">${t('Automático usa português em dispositivos configurados em português e inglês nos demais. A escolha fica salva neste navegador.')}</p></section>`;
}
export function setupLanguage({document,window,navigator = window?.navigator,localStorage} = {}) {
  if (!document || !window) return null;
  if(controllers.has(document)){activeController=controllers.get(document);return activeController;}
  if(localStorage === undefined)try{localStorage=window.localStorage;}catch{localStorage=null;}
  let saved='system';try{const value=localStorage?.getItem(LANGUAGE_KEY);if(valid(value))saved=value;}catch{}
  let disposed=false;
  const apply=(value,persist=false,notify=true)=>{
    preference=valid(value)?value:'system';language=preference==='system'?detectLanguage(navigator):preference;
    if(persist)try{localStorage?.setItem(LANGUAGE_KEY,preference);}catch{}
    document.documentElement?.setAttribute?.('lang',language==='pt'?'pt-BR':'en');
    if(document.documentElement?.dataset)document.documentElement.dataset.language=language;
    translateStatic(document);
    document.querySelectorAll?.('[data-language-preference]').forEach(element=>{
      if(element.tagName==='SELECT')element.value=preference;
      else element.setAttribute('aria-pressed',String(element.dataset.languagePreference===preference));
    });
    if(notify){
      const EventClass=window.CustomEvent||globalThis.CustomEvent;
      if(EventClass&&window.dispatchEvent)window.dispatchEvent(new EventClass('trespasser:language',{detail:{language,preference}}));
    }
  };
  const onChange=event=>{const element=event.target?.closest?.('[data-language-preference]');if(element?.tagName==='SELECT')apply(element.value,true);};
  const onClick=event=>{const element=event.target?.closest?.('button[data-language-preference]');if(element)apply(element.dataset.languagePreference,true);};
  const onStorage=event=>{if(event.key===LANGUAGE_KEY||event.key===null)apply(event.key===null?'system':event.newValue,false);};
  const onSystem=()=>{if(preference==='system')apply('system');};
  const controller={setPreference:value=>{if(valid(value))apply(value,true);},getLanguage,getPreference:getLanguagePreference,
    dispose(){if(disposed)return;disposed=true;document.removeEventListener?.('change',onChange);document.removeEventListener?.('click',onClick);window.removeEventListener?.('storage',onStorage);window.removeEventListener?.('languagechange',onSystem);controllers.delete(document);if(activeController===controller)activeController=null;}};
  controllers.set(document,controller);activeController=controller;
  document.addEventListener?.('change',onChange);document.addEventListener?.('click',onClick);
  window.addEventListener?.('storage',onStorage);window.addEventListener?.('languagechange',onSystem);
  apply(saved,false,false);
  return controller;
}
registerMessages({
  'Idioma':'Language','Idioma da interface':'Interface language','Automático (dispositivo)':'Automatic (device)',
  'Automático usa português em dispositivos configurados em português e inglês nos demais. A escolha fica salva neste navegador.':'Automatic uses Portuguese on devices set to Portuguese and English otherwise. Your choice is saved in this browser.',
  'Seus registros':'Your records','Sua aventura começa aqui':'Your adventure starts here',
  'Crie e organize seus personagens e refúgios de Trespasser. Salve na sua conta, continue no celular ou no computador e exporte PDF editável e JSON.':'Create and organize your Trespasser characters and havens. Save to your account, continue on your phone or computer, and export fillable PDFs and JSON.',
  'Não foi possível preparar seus personagens. Recarregue para tentar novamente.':'Your characters could not be prepared. Reload to try again.',
  'Preparando seus registros salvos…':'Preparing your saved records…',
  'Escolha o registro de personagens ou de refúgios para continuar sua aventura.':'Choose the character or haven record to continue your adventure.',
  'Verificando seu acesso…':'Checking your access…','Carregando personagens…':'Loading characters…',
  'Abrindo personagens…':'Opening characters…','Abrindo refúgios…':'Opening havens…',
  'Começar':'Get started','Registro de Personagens':'Character Records','Registro de Refúgios':'Haven Records',
  'Configurações':'Settings','Ajustes':'Settings','Início':'Home','Personagens':'Characters','Refúgios':'Havens',
  'Fechar':'Close','Ativar modo escuro':'Switch to dark mode','Ativar modo claro':'Switch to light mode',
  'Claro':'Light','Modo escuro':'Dark mode','Automático':'Automatic','Aparência':'Appearance',
  'Tema da ficha':'Sheet theme','Automático acompanha o tema do dispositivo. A escolha fica salva neste navegador.':'Automatic follows your device theme. Your choice is saved in this browser.',
  'Conta':'Account','SUA CONTA':'YOUR ACCOUNT','Conta conectada':'Connected account','Sair deste dispositivo':'Sign out on this device',
  'Importar':'Import','Exportar':'Export','Gerenciar':'Manage','Regras & salvamento':'Rules & saving',
  'Salvo neste navegador':'Saved in this browser','Salvo online':'Saved online','Sincronizando com sua conta…':'Syncing with your account…',
  'Salvamento indisponível · exporte uma cópia':'Saving unavailable · export a copy',
  'Sem conexão · alterações pendentes neste navegador':'Offline · pending changes in this browser',
  'Salvo neste dispositivo · sincronização pendente':'Saved on this device · sync pending',
  'Exportar uma cópia':'Export a copy','Verificando sua conta…':'Checking your account…',
  'Há edições que não foram guardadas. Exporte uma cópia e mantenha a página aberta.':'Some edits have not been saved. Export a copy and keep this page open.',
  'Alterações pendentes ficam neste navegador para sincronizar quando você entrar novamente.':'Pending changes stay in this browser and sync when you sign in again.',
  'O salvamento é automático. PDF e JSON são cópias independentes.':'Saving is automatic. PDFs and JSON files are independent copies.',
  'Preparando exportação':'Preparing export','PDF + JSON prontos':'PDF + JSON ready','Baixar ZIP':'Download ZIP','Baixar PDF editável':'Download fillable PDF','Baixar JSON':'Download JSON','Baixar JSON de backup':'Download JSON backup',
  'A exportação do PDF não foi concluída':'PDF export did not complete','Cancelar':'Cancel','Excluir':'Delete','Adicionar':'Add',
  'Cópia criada.':'Copy created.','O JSON deve ter no máximo 2 MB.':'The JSON file must be no larger than 2 MB.',
  'A conta mudou durante a importação. Tente novamente.':'The account changed during import. Please try again.',
  'Não foi possível importar este JSON.':'This JSON file could not be imported.',
  'Fan made por':'Fan made by','Fan-made por':'Fan-made by',
  'Lista de fichas inválida.':'Invalid record list.','Há identificadores de ficha repetidos.':'Some records have duplicate identifiers.',
  'Resposta de sincronização inválida.':'Invalid sync response.','Exclusão de ficha inválida.':'Invalid record deletion.',
  'A resposta da nuvem contém um identificador diferente.':'The cloud response contains a different identifier.',
  'A nuvem retornou fichas repetidas.':'The cloud returned duplicate records.',
  'Não foi possível criar um identificador seguro.':'A secure identifier could not be created.',
  'Armazenamento local indisponível.':'Local storage unavailable.',
  'Não foi possível salvar a cópia neste navegador. Mantenha a página aberta até a sincronização terminar ou exporte a ficha.':'This browser could not save the local copy. Keep the page open until sync finishes or export the sheet.',
  'Não foi possível ler a cópia deste navegador.':'This browser’s copy could not be read.',
  'A cópia deste navegador está inválida. A versão da nuvem será consultada; os dados anteriores foram mantidos para recuperação.':'This browser’s copy is invalid. The cloud version will be checked; previous data has been kept for recovery.',
  'Não foi possível preservar uma cópia da ficha.':'A copy of the sheet could not be preserved.',
  'A ficha foi excluída em outro dispositivo. Suas alterações foram preservadas em uma cópia com “(conflito)”.':'The sheet was deleted on another device. Your edits were preserved in a copy with “(conflito)” in its name.',
  'Encontramos outra versão desta ficha. A versão deste dispositivo foi preservada com “(conflito)”.':'Another version of this sheet was found. This device’s version was preserved with “(conflito)” in its name.',
  'A ficha que você excluiu recebeu alterações em outro dispositivo e foi restaurada para preservar esses dados.':'The sheet you deleted was edited on another device and has been restored to preserve those changes.',
  'Dois dispositivos alteraram o mesmo campo. Suas alterações foram preservadas em uma cópia com “(conflito)”.':'Two devices edited the same field. Your edits were preserved in a copy with “(conflito)” in its name.',
  'A nuvem retornou uma revisão anterior da ficha. Tente novamente.':'The cloud returned an older sheet revision. Please try again.',
  'A ficha anterior não foi encontrada na nuvem. A cópia deste dispositivo foi preservada com “(conflito)”.':'The previous sheet was not found in the cloud. This device’s copy was preserved with “(conflito)” in its name.',
  'Confirmação de salvamento inválida.':'Invalid save confirmation.',
  'A exclusão já tinha sido enviada. A ficha reaberta foi preservada em uma cópia com “(conflito)”.':'Deletion had already been sent. The reopened sheet was preserved in a copy with “(conflito)” in its name.',
  'Esta ficha já foi excluída na nuvem. As alterações foram preservadas em uma cópia com “(conflito)”.':'This sheet has already been deleted from the cloud. Edits were preserved in a copy with “(conflito)” in its name.',
  'Ficha salva online. A cópia deste navegador está indisponível.':'Sheet saved online. This browser’s copy is unavailable.',
  'Ainda há alterações pendentes. A próxima sincronização tentará novamente.':'Some changes are still pending. The next sync will try again.',
  'Não foi possível sincronizar nem salvar neste navegador. Mantenha a página aberta ou exporte a ficha.':'The browser could neither sync nor save. Keep this page open or export the sheet.',
  'Sua sessão precisa ser renovada para sincronizar. As alterações continuam salvas neste navegador.':'Your session must be renewed to sync. Changes remain saved in this browser.',
  'Não foi possível acessar a nuvem. As alterações ficam salvas neste navegador e serão enviadas ao reconectar.':'The cloud could not be reached. Changes are saved in this browser and will be sent when you reconnect.',
});
