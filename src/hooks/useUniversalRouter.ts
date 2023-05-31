import { BigNumber } from '@ethersproject/bignumber'
import { t } from '@lingui/macro'
import { EthersAdapter } from '@safe-global/protocol-kit'
import Safe, { SafeTrans } from '@safe-global/protocol-kit'
import {
  MultisigTransactionRequest,
  Operation,
  proposeTransaction,
  setBaseUrl as setGatewayBaseUrl,
} from '@safe-global/safe-gateway-typescript-sdk'
import { sendTransaction } from '@uniswap/conedison/provider/index'
import { Percent } from '@uniswap/sdk-core'
import { SwapRouter, UNIVERSAL_ROUTER_ADDRESS } from '@uniswap/universal-router-sdk'
import { FeeOptions, toHex } from '@uniswap/v3-sdk'
import { useWeb3React } from '@web3-react/core'
import { TX_GAS_MARGIN } from 'constants/misc'
import { DismissableError, UserRejectedRequestError, WidgetPromise } from 'errors'
import { ethers } from 'ethers'
import { useCallback, useEffect, useMemo } from 'react'
import { InterfaceTrade } from 'state/routing/types'
import { SwapTransactionInfo, TransactionType } from 'state/transactions'
import { useGnosisContext } from 'stores'
import isZero from 'utils/isZero'
import { isUserRejection } from 'utils/jsonRpcError'
import { swapErrorToUserReadableMessage } from 'utils/swapErrorToUserReadableMessage'

import { usePerfEventHandler } from './usePerfEventHandler'
import { PermitSignature } from './usePermitAllowance'

interface SwapOptions {
  slippageTolerance: Percent
  deadline?: BigNumber
  permit?: PermitSignature
  feeOptions?: FeeOptions
}

// return proposeTransaction(chainId, safeAddress, {
//   ...tx.data,
//   safeTxHash,
//   sender,
//   value: tx.data.value.toString(),
//   operation: tx.data.operation as unknown as Operation,
//   nonce: tx.data.nonce.toString(),
//   safeTxGas: tx.data.safeTxGas.toString(),
//   baseGas: tx.data.baseGas.toString(),
//   gasPrice: tx.data.gasPrice.toString(),
//   signature: signatures,
//   origin,
// })

// {
//   "to": "0x2FC2C37957130615Dacde5Dd0c2c58a56A05A71b",
//   "value": "1000000000000000",
//   "data": "0x",
//   "operation": 0,
// "baseGas": "0",
// "gasPrice": "0",
// "gasToken": "0x0000000000000000000000000000000000000000",
// "refundReceiver": "0x0000000000000000000000000000000000000000",
//   "nonce": "2",
//   "safeTxGas": "0",
//   "safeTxHash": "0xadbcecf944852267b2c630554a6fee5d594ad41bc761a564d40d50ff35914c71",
//   "sender": "0x1bFE34139c6d4Ec785CDf6B89F26AF8270250fFf",
//   "signature": "0x5b55b292aa7c7faaa9e1e67d2bbfa53852afedf3a34d4c8ea227035862c6a7180e3a2ceb6461cc208152902877a8d2a40b5513150fd7a1015e83b593afd0e7701c"
// }

// sample uniswap swap
// from: '0x1bFE34139c6d4Ec785CDf6B89F26AF8270250fFf',
// to: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
// data: '0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000646f8bb100000000000000000000000000000000000000000000000000000000000000020b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000002386f26fc1000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000002386f26fc10000000000000000000000000000000000000000000000000000001a75cb1047b19e00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002b0d500b1d8e8ef31e21c99d1db9a6444d3adf12700001f48f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000000000000000000000',
// value: '0x2386f26fc10000',

// mine
// baseGas: '0'
// data: '0x24856bc3000000000000000000000000000000000000
//000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800
//0000000000000000000000000000000000000000000000000000000000000020b0000000000000000000000000000
//0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
//2000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000
//000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000400
//0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000
//00000000000000016345785d8a00000000000000000000000000000000000000000000000000000000000000000100000
//00000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000
//00000000016345785d8a0000000000000000000000000000000000000000000000000000013c0ca168896a220000000000000
//0000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000
//0000000000000000000000000000000000000000000000000000000000000000000000002b0d500b1d8e8ef31e21c99d1db9a6444d3ad
// f12700001f48f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000000000000000000000'
// gasPrice: '0'
// gasToken: '0x0000000000000000000000000000000000000000'
// nonce: '2'
// operation: 0
// origin: 'http://localhost:3000'
// refundReceiver: '0x0000000000000000000000000000000000000000'
// safeTxGas: '0'
// safeTxHash: '0x43145850e8063d225d81b8d67b8eeda0c57336eab1756ea9d244fb050caa73d0'
// sender: '0xb949ff518B0cF6f71005FA2B5eE16e02Ab19eec9'
// signature: undefined
// to: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5'
// value: '0x016345785d8a0000'

// proper swap
const properswap = {
  to: '0x4C60051384bd2d3C01bfc845Cf5F4b44bcbE9de5',
  value: '100000000000000000',
  data: '0x24856bc30000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000020b000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000016345785d8a000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000016345785d8a0000000000000000000000000000000000000000000000000000013c0ca168896a2200000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002b0d500b1d8e8ef31e21c99d1db9a6444d3adf12700001f48f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000000000000000000000',
  operation: 0,
  baseGas: '0',
  gasPrice: '0',
  gasToken: '0x0000000000000000000000000000000000000000',
  refundReceiver: '0x0000000000000000000000000000000000000000',
  nonce: '5',
  safeTxGas: '0',
  safeTxHash: '0x2510c499d006ac93d11bfbc14c4b13d65b6b01cb35bbdcf3c2f2f66fb8a5c365',
  sender: '0x1bFE34139c6d4Ec785CDf6B89F26AF8270250fFf',
  signature:
    '0xf32f2d2e0c2aa232c0514d6b768b531c7dc39c3235cbddd7f690d4e34483cfaa4054bba738b201b8132c16ddd7b88168ec7aeab9f9ef02ee3393e126d019ce221c',

  origin: '{"name":"Gnosis Safe App Starter","url":"http://localhost:3001"}',
}
/**
 * Returns a callback to submit a transaction to the universal router.
 *
 * The callback returns the TransactionResponse if the transaction was submitted,
 * or undefined if the user rejected the transaction.
 **/
export function useUniversalRouterSwapCallback(trade: InterfaceTrade | undefined, options: SwapOptions) {
  const { account, chainId, provider } = useWeb3React()
  const safeAddress = useGnosisContext()?.safeAddress
  const isDev = useGnosisContext()?.isDev ?? false

  useEffect(() => {
    if (isDev) setGatewayBaseUrl('https://safe-client.staging.5afe.dev')
  }, [isDev])

  const makeProposal = async (tx: any) => {
    if (!provider || !safeAddress || !chainId || !account) return

    const ethAdapterOwner1 = new EthersAdapter({
      ethers,
      signerOrProvider: provider.getSigner(0),
    })

    const safe = await Safe.create({
      ethAdapter: ethAdapterOwner1,
      safeAddress,
    })

    try {
      const safeTransaction = await safe.createTransaction({ safeTransactionData: { ...tx, nonce: '6' } })
      const sigs = await safe.signTransaction(safeTransaction)
      const signature = sigs.signatures.get(account.toLocaleLowerCase())?.data
      const safeTxHash = await safe.getTransactionHash(safeTransaction)

      const multisigTransactionRequest: MultisigTransactionRequest = {
        ...safeTransaction.data,
        safeTxHash,
        sender: account,
        value: safeTransaction.data.value.toString(),
        operation: safeTransaction.data.operation as unknown as Operation,
        nonce: safeTransaction.data.nonce.toString(),
        safeTxGas: safeTransaction.data.safeTxGas.toString(),
        baseGas: safeTransaction.data.baseGas.toString(),
        gasPrice: safeTransaction.data.gasPrice.toString(),
        signature,
        origin,
      }

      // console.log('multisig')
      // console.log(multisigTransactionRequest)

      const proposal = await proposeTransaction(chainId.toString(), safeAddress, multisigTransactionRequest)
      console.log('proposed')
      console.log(proposal)
    } catch (err) {
      console.log('failed to create the tx')
      console.log(err)
    }
  }

  const swapCallback = useCallback(
    () =>
      WidgetPromise.from(
        async () => {
          if (!account) throw new Error('missing account')
          if (!chainId) throw new Error('missing chainId')
          if (!provider) throw new Error('missing provider')
          if (!trade) throw new Error('missing trade')

          const { calldata: data, value } = SwapRouter.swapERC20CallParameters(trade, {
            slippageTolerance: options.slippageTolerance,
            deadlineOrPreviousBlockhash: options.deadline?.toString(),
            inputTokenPermit: options.permit,
            fee: options.feeOptions,
          })

          const tx = {
            from: account,
            to: UNIVERSAL_ROUTER_ADDRESS(chainId),
            data,
            // TODO: universal-router-sdk returns a non-hexlified value.
            ...(value && !isZero(value) ? { value: parseInt(value, 16).toString() } : {}),
          }

          await makeProposal(tx)

          // const response = await sendTransaction(provider, tx, TX_GAS_MARGIN)

          // if (tx.data !== response.data) {
          //   throw new DismissableError({
          //     message: t`Your swap was modified through your wallet. If this was a mistake, please cancel immediately or risk losing your funds.`,
          //     error: 'Swap was modified in wallet.',
          //   })
          // }

          return {
            type: TransactionType.SWAP,
            // response,
            tradeType: trade.tradeType,
            trade,
            slippageTolerance: options.slippageTolerance,
          } as SwapTransactionInfo
        },
        null,
        (error) => {
          if (error instanceof DismissableError) throw error
          if (isUserRejection(error)) throw new UserRejectedRequestError()
          throw new DismissableError({ message: swapErrorToUserReadableMessage(error), error })
        }
      ),
    [account, chainId, options.deadline, options.feeOptions, options.permit, options.slippageTolerance, provider, trade]
  )

  const args = useMemo(() => trade && { trade }, [trade])
  return usePerfEventHandler('onSwapSend', args, swapCallback)
}
