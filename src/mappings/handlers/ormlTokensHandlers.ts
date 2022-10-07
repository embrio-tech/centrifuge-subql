import { SubstrateEvent } from '@subql/types'
import { errorHandler } from '../../helpers/errorHandler'
import { TokensTransferEvent } from '../../helpers/types'
import { AccountService } from '../services/accountService'
import { CurrencyService } from '../services/currencyService'
import { InvestorTransactionService } from '../services/investorTransactionService'
import { PoolService } from '../services/poolService'
import { TrancheService } from '../services/trancheService'

export const handleTokenTransfer = errorHandler(_handleTokenTransfer)
async function _handleTokenTransfer(event: SubstrateEvent<TokensTransferEvent>): Promise<void> {
  const [currency, from, to, amount] = event.event.data

  // TRANCHE TOKEN TRANSFERS
  if (currency.isTranche) {
    const [poolId, trancheId] = currency.asTranche
    const fromAddress = String.fromCharCode(...from.toU8a())
    const toAddress = String.fromCharCode(...to.toU8a())

    if (fromAddress.startsWith('pool') || toAddress.startsWith('pool')) {
      logger.info(
        `Tranche Token transfer tor tranche: ${poolId.toString()}-${trancheId.toString()}. ` +
          `from: ${from.toString()} to: ${to.toString()} amount: ${amount.toString()} ` +
          `at block ${event.block.block.header.number.toString()}`
      )

      // Get corresponding pool
      const pool = await PoolService.getById(poolId.toString())
      const tranche = await TrancheService.getById(poolId.toString(), trancheId.toHex())
      const [fromAccount, toAccount] = await Promise.all([
        AccountService.getOrInit(fromAddress),
        AccountService.getOrInit(toAddress),
      ])

      // Update tranche price
      await tranche.updatePriceFromRpc()
      await tranche.save()

      const orderData = {
        poolId: poolId.toString(),
        trancheId: trancheId.toString(),
        epochNumber: pool.pool.currentEpoch,
        hash: event.extrinsic.extrinsic.hash.toString(),
        timestamp: event.block.timestamp,
        digits: (await CurrencyService.getById(pool.pool.currencyId)).currency.decimals,
        price: tranche.trancheState.price,
        amount: amount.toBigInt(),
      }

      // CREATE 2 TRANSFERS FOR FROM AND TO ADDRESS
      // with from create TRANSFER_OUT
      const txOut = InvestorTransactionService.transferOut({ ...orderData, address: fromAccount.account.id })
      await txOut.save()

      // with to create TRANSFER_IN
      const txIn = InvestorTransactionService.transferIn({ ...orderData, address: toAccount.account.id })
      await txIn.save()
    }
  } else if (!currency.isTranche && !currency.isNone && !currency.isEmpty) {
    //DO DOMETHING
  }
}
