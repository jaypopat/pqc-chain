import type { Prefix } from '../utils/sdk'
import { formatValue } from '@polkadot-api/react-components'
import { connectInjectedExtension } from 'polkadot-api/pjs-signer'
import { name } from '../../package.json'
import { connectedWallet, selectedAccount } from '../hooks/useConnect'
import sdk from '../utils/sdk'

export const DAPP_NAME = name

export async function polkadotSigner() {
  const selectedExtension = await connectInjectedExtension(
    connectedWallet.get()?.extensionName || '',
  )
  const account = selectedExtension
    .getAccounts()
    .find(account => account.address === selectedAccount.get()?.address)
  return account?.polkadotSigner
}

export async function subscribeToBlocks(
  networkKey: Prefix,
  onBlock: (data: { blockHeight: number, chainName: string }) => void,
) {
  const { client } = sdk(networkKey)
  const chainName = await client.getChainSpecData().then(data => data.name)

  return client.blocks$.subscribe(async (block) => {
    onBlock({ blockHeight: block.number, chainName })
  })
}

export async function getBalance(chainPrefix: Prefix, address: string) {
  const { api, client } = sdk(chainPrefix)
  const [balance, chainSpec] = await Promise.all([
    api.query.System.Account.getValue(address),
    client.getChainSpecData(),
  ])
  const tokenDecimals = chainSpec.properties.tokenDecimals
  const tokenSymbol = chainSpec.properties.tokenSymbol
  const freeBalance = formatValue(balance.data.free, tokenDecimals)

  return {
    balance: freeBalance,
    symbol: tokenSymbol,
    chainName: chainSpec.name,
  }
}
