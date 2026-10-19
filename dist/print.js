// Native form controls can clip their text in a PDF. Replace them only while
// printing, then put the original nodes back so editing and event handling survive.
const preparations = new WeakMap();

export function preparePrint(rootElement = document.querySelector('#main')) {
  if (!rootElement) return () => {};
  preparations.get(rootElement)?.();

  const doc = rootElement.ownerDocument;
  const replacements = [];
  const styles = new Map();
  const details = [];
  const focused = rootElement.contains(doc.activeElement) ? doc.activeElement : null;
  let restored = false;

  function setStyles(element, values) {
    if (!styles.has(element)) styles.set(element, element.getAttribute('style'));
    Object.assign(element.style, values);
  }

  function allowTextToFlow(element, large) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const values = {
        overflow: 'visible', maxHeight: 'none', height: 'auto',
        breakInside: 'auto', pageBreakInside: 'auto', minWidth: '0',
      };
      // Long journal entries must be able to continue on the next page. A grid
      // or flex row containing the whole entry can otherwise become indivisible.
      const display = doc.defaultView?.getComputedStyle(parent).display || '';
      if (large && /grid|flex/.test(display)) values.display = 'block';
      setStyles(parent, values);
      if (parent === rootElement) break;
    }
  }

  for (const element of rootElement.querySelectorAll('details')) {
    details.push([element, element.open]);
    element.open = true;
  }

  for (const control of rootElement.querySelectorAll('input, textarea, select')) {
    if (control.tagName === 'INPUT' && ['hidden', 'button', 'submit', 'reset', 'image', 'file'].includes(control.type)) continue;
    const choice = control.tagName === 'INPUT' && ['checkbox', 'radio'].includes(control.type);
    const multiline = control.tagName === 'TEXTAREA' || (control.tagName === 'SELECT' && control.multiple);
    // A span remains valid inside the existing label; display:block gives long
    // values normal document flow without introducing a nested form control.
    const replacement = doc.createElement('span');
    const computed = doc.defaultView?.getComputedStyle(control);
    let value;
    if (choice) value = control.checked ? '■' : '□';
    else if (control.tagName === 'SELECT') value = Array.from(control.selectedOptions, option => option.textContent).join('\n');
    else value = control.value;

    const large = value.length > 600 || value.split('\n').length > 8;
    replacement.className = `print-value${multiline || large ? ' print-long-text' : ''}${choice ? ' print-choice' : ''}`;
    replacement.textContent = value || '\u00a0';
    Object.assign(replacement.style, {
      display: choice ? 'inline-block' : 'block', boxSizing: 'border-box',
      width: choice ? 'auto' : '100%', minWidth: '0', maxWidth: '100%',
      height: 'auto', maxHeight: 'none', overflow: 'visible',
      whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal',
      breakInside: multiline || large ? 'auto' : 'avoid', pageBreakInside: multiline || large ? 'auto' : 'avoid',
      fontFamily: choice ? 'Arial, sans-serif' : computed?.fontFamily || 'inherit',
      fontSize: computed?.fontSize || 'inherit', fontWeight: computed?.fontWeight || 'inherit',
      fontStyle: computed?.fontStyle || 'normal', lineHeight: computed?.lineHeight || '1.5',
      letterSpacing: computed?.letterSpacing || 'normal', textAlign: computed?.textAlign || 'start',
      color: '#111', padding: choice ? '0' : '4px 0',
      minHeight: choice ? '1em' : '1.4em',
    });
    if (control.getAttribute('aria-label')) replacement.setAttribute('aria-label', control.getAttribute('aria-label'));

    // The key-attribute radio also has a decorative diamond. Printing it next
    // to the actual checked state would make an unchecked radio look selected.
    if (choice && control.parentElement?.tagName === 'LABEL') {
      for (const sibling of control.parentElement.children) {
        if (sibling !== control && sibling.getAttribute('aria-hidden') === 'true') setStyles(sibling, { display: 'none' });
      }
    }

    control.replaceWith(replacement);
    replacements.push([control, replacement]);
    if (multiline || large) allowTextToFlow(replacement, large);
  }

  const cleanup = () => {
    if (restored) return;
    restored = true;
    for (const [control, replacement] of replacements) {
      if (replacement.parentNode) replacement.replaceWith(control);
    }
    for (const [element, original] of styles) {
      if (original === null) element.removeAttribute('style');
      else element.setAttribute('style', original);
    }
    for (const [element, wasOpen] of details) element.open = wasOpen;
    if (focused?.isConnected) focused.focus({ preventScroll: true });
    if (preparations.get(rootElement) === cleanup) preparations.delete(rootElement);
  };
  preparations.set(rootElement, cleanup);
  return cleanup;
}
