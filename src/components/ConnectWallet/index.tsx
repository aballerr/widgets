import { useGnosisContext } from 'stores/index'

import ConnectedWalletChip from './ConnectedWalletChip'

interface WalletProps {
  disabled?: boolean
}

export default function Wallet({ disabled }: WalletProps) {
  const safeAddress = useGnosisContext()?.safeAddress

  return !Boolean(safeAddress) ? null : <ConnectedWalletChip disabled={disabled} account={safeAddress} />
}
