import { useEffect, useId, useRef, useState } from 'react';

export default function ConfirmButton({ children = 'Reset', actionName, triggerAriaLabel, onConfirm, confirmationMessage, confirmLabel = 'Confirm', cancelLabel = 'Cancel', className = '', containerClassName = '' }) {
  const [confirming, setConfirming] = useState(false);
  const triggerRef = useRef(null);
  const confirmRef = useRef(null);
  const confirmationId = useId();
  const accessibleActionName = actionName ?? (typeof children === 'string' ? children.toLowerCase() : 'this action');

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const cancel = () => {
    setConfirming(false);
    triggerRef.current?.focus();
  };

  const confirm = () => {
    const focusTargets = [
      triggerRef.current?.closest('details')?.querySelector(':scope > summary'),
      triggerRef.current?.closest('.simulator-base-topbar')?.querySelector('a')
    ];
    setConfirming(false);
    onConfirm?.();
    requestAnimationFrame(() => {
      const target = [triggerRef.current, ...focusTargets].find((element) => element?.isConnected);
      target?.focus();
    });
  };

  return <span className={`confirm-button-shell ${containerClassName}`} onKeyDown={(event) => {
    if (event.key === 'Escape' && confirming) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }}>
    <button
      ref={triggerRef}
      type="button"
      className={className}
      aria-label={triggerAriaLabel}
      aria-expanded={confirming}
      aria-controls={confirming ? confirmationId : undefined}
      aria-describedby={confirming ? `${confirmationId}-message` : undefined}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); setConfirming(true); }}
    >{children}</button>
    {confirming && <span id={confirmationId} className="confirm-button-confirmation" role="group" aria-label={`Confirm ${accessibleActionName}`}>
      <span id={`${confirmationId}-message`} className="confirm-button-message" aria-live="assertive">{confirmationMessage ?? `Confirm ${accessibleActionName}?`}</span>
      <button ref={confirmRef} type="button" className="confirm-button-accept" aria-label={`Confirm ${accessibleActionName}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); confirm(); }}>{confirmLabel}</button>
      <button type="button" className="confirm-button-cancel" onClick={(event) => { event.preventDefault(); event.stopPropagation(); cancel(); }}>{cancelLabel}</button>
    </span>}
  </span>;
}