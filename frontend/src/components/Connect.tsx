import { useEffect, useRef, useState } from 'react'
import { useConnect } from '../hooks/useConnect'
import { stripAddress } from '../utils/formatters'

export default function Connect() {
  const modalRef = useRef<HTMLDialogElement>(null)
  const [showOtherWallets, setShowOtherWallets] = useState(false)

  const {
    listAccounts,
    selectedAccount,
    connectedWallet,
    isConnecting,
    installedWallets,
    availableWallets,
    connect,
    selectAccount,
    disconnect,
  } = useConnect()

  function open() {
    modalRef.current?.showModal()
  }
  function close() {
    modalRef.current?.close()
  }

  function pick(acc: typeof selectedAccount) {
    if (acc) {
      selectAccount(acc)
      close()
    }
  }

  // close on Escape — native <dialog> already does, but ensure backdrop clicks work
  useEffect(() => {
    const dlg = modalRef.current
    if (!dlg)
      return
    const onClick = (e: MouseEvent) => {
      const rect = dlg.getBoundingClientRect()
      const inside
        = e.clientX >= rect.left && e.clientX <= rect.right
          && e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!inside)
        close()
    }
    dlg.addEventListener('click', onClick)
    return () => dlg.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      <div className="flex items-center gap-2">
        {selectedAccount
          ? (
              <button
                type="button"
                onClick={open}
                className="inline-flex items-center gap-2.5 px-3 py-1.5 text-[11px] font-mono border border-rule-strong text-ink hover:border-violet hover:bg-violet/[0.05] transition-colors"
                title={selectedAccount.address}
              >
                {connectedWallet?.logo?.src && (
                  <img src={connectedWallet.logo.src} alt={connectedWallet.logo.alt} className="w-3.5 h-3.5" />
                )}
                <span className="font-medium text-ink">{selectedAccount.name}</span>
                <span className="text-mut">{stripAddress(selectedAccount.address)}</span>
              </button>
            )
          : (
              <button
                type="button"
                onClick={open}
                className="inline-flex items-center gap-2 px-4 py-2 text-[11px] tracking-[0.14em] uppercase font-medium bg-ink text-paper hover:bg-ink-soft transition-colors"
              >
                <span className="icon-[mdi--wallet-outline] text-base" />
                <span>Connect</span>
              </button>
            )}

        {selectedAccount && (
          <button
            type="button"
            onClick={disconnect}
            title="Disconnect"
            className="inline-flex items-center justify-center w-8 h-8 border border-rule text-mut hover:text-rose-ink hover:border-rose-ink/40 transition-colors"
          >
            <span className="icon-[mdi--logout] text-[15px]" />
          </button>
        )}
      </div>

      <dialog
        ref={modalRef}
        className="bg-transparent p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-sm m-auto"
      >
        <div className="surface-strong w-[min(640px,92vw)] p-7" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] font-mono tracking-[0.24em] uppercase text-violet">Wallet</div>
              <h3 className="text-[22px] font-semibold tracking-[-0.02em] mt-1">Connect a signer</h3>
            </div>
            <button
              type="button"
              onClick={close}
              className="inline-flex items-center justify-center w-8 h-8 border border-rule text-mut hover:text-ink hover:border-rule-strong"
            >
              <span className="icon-[mdi--close] text-[15px]" />
            </button>
          </div>

          {listAccounts.length > 0 && (
            <div className="mb-6">
              <div className="label-tag mb-3">Select account</div>
              <div className="space-y-1.5">
                {listAccounts.map((account) => {
                  const isSel = selectedAccount?.address === account.address
                  return (
                    <button
                      key={account.address}
                      type="button"
                      onClick={() => pick(account)}
                      className={`group w-full flex items-center justify-between gap-3 px-4 py-3 border transition-colors text-left ${
                        isSel
                          ? 'border-violet bg-violet/[0.05]'
                          : 'border-rule hover:border-rule-strong hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${isSel ? 'bg-violet text-paper' : 'bg-paper border border-rule text-mut'}`}>
                          <span className="icon-[mdi--account-outline] text-[16px]" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-[13px] font-medium text-ink truncate">{account.name}</div>
                          <div className="text-[11px] font-mono text-mut truncate">{stripAddress(account.address)}</div>
                        </div>
                      </div>
                      {isSel && (
                        <span className="text-[10px] font-mono tracking-[0.2em] uppercase text-violet">selected</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {installedWallets.length > 0 && (
            <div className="mb-6">
              <div className="label-tag mb-3">Installed</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {installedWallets.map((wallet) => {
                  const isCur = connectedWallet?.extensionName === wallet.extensionName
                  const isBusy = isConnecting === wallet.extensionName
                  return (
                    <button
                      key={wallet.extensionName}
                      type="button"
                      disabled={isBusy}
                      onClick={() => connect(wallet)}
                      className={`flex flex-col items-center gap-2 p-4 border transition-colors ${
                        isCur ? 'border-violet bg-violet/[0.05]' : 'border-rule hover:border-rule-strong hover:bg-white'
                      }`}
                    >
                      <div className="relative">
                        <img src={wallet.logo.src} alt={wallet.logo.alt} className="w-10 h-10" />
                        {isCur && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-violet text-paper inline-flex items-center justify-center">
                            <span className="icon-[mdi--check] text-[10px]" />
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] font-medium text-ink">{wallet.title}</div>
                      <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-mut inline-flex items-center gap-1">
                        {isBusy && <span className="icon-[mdi--loading] animate-spin" />}
                        {isCur ? 'connected' : isBusy ? 'connecting' : 'connect →'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {availableWallets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="label-tag">Other wallets</div>
                <button
                  type="button"
                  onClick={() => setShowOtherWallets(s => !s)}
                  className="text-[11px] font-mono text-mut hover:text-ink inline-flex items-center gap-1"
                >
                  {showOtherWallets ? 'hide' : 'show'}
                  <span className={showOtherWallets ? 'icon-[mdi--chevron-up]' : 'icon-[mdi--chevron-down]'} />
                </button>
              </div>
              {showOtherWallets && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableWallets.map(wallet => (
                    <a
                      key={wallet.extensionName}
                      href={wallet.installUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-4 border border-rule hover:border-rule-strong hover:bg-white transition-colors text-center"
                    >
                      <img src={wallet.logo.src} alt={wallet.logo.alt} className="w-10 h-10 opacity-70" />
                      <div className="text-[12px] font-medium text-ink">{wallet.title}</div>
                      <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-mut inline-flex items-center gap-1">
                        download
                        {' '}
                        <span className="icon-[mdi--open-in-new]" />
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </dialog>
    </>
  )
}
