import type { PolkadotClient, TypedApi } from 'polkadot-api'
import { createAtom } from '@xstate/store'
import { createClient } from 'polkadot-api'
import { withPolkadotSdkCompat } from 'polkadot-api/polkadot-sdk-compat'
import { getWsProvider } from 'polkadot-api/ws-provider'
import { ql } from '../descriptors'

const config = {
  ql: {
    descriptor: ql,
    providers: ['ws://127.0.0.1:9944'],
  },
} as const

export type Prefix = keyof typeof config
export const chainKeys = Object.keys(config) as Prefix[]

const clientStore = createAtom<Partial<Record<Prefix, PolkadotClient>>>({})

export default function sdk<T extends Prefix>(chain: T) {
  const clients = clientStore.get()

  if (!clients[chain]) {
    clients[chain] = createClient(
      withPolkadotSdkCompat(
        getWsProvider(config[chain].providers[0]),
      ),
    )
  }

  return {
    api: clients[chain]!.getTypedApi(config[chain].descriptor) as TypedApi<typeof config[T]['descriptor']>,
    client: clients[chain]!,
  }
}
