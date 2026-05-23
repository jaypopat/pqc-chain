import { sr25519CreateDerive } from '@polkadot-labs/hdkd'
import { DEV_PHRASE, entropyToMiniSecret, mnemonicToEntropy } from '@polkadot-labs/hdkd-helpers'
import { getPolkadotSigner } from 'polkadot-api/signer'

const miniSecret = entropyToMiniSecret(mnemonicToEntropy(DEV_PHRASE))
const derive = sr25519CreateDerive(miniSecret)

const alice = derive('//Alice')
const bob = derive('//Bob')

export const aliceSigner = getPolkadotSigner(alice.publicKey, 'Sr25519', alice.sign)
export const bobSigner = getPolkadotSigner(bob.publicKey, 'Sr25519', bob.sign)

export const aliceAddress = alice.publicKey
export const bobAddress = bob.publicKey
