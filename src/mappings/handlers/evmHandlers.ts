import { createTrancheTrackerDatasource } from '../../types'
import { errorHandler } from '../../helpers/errorHandler'
import { DeployTrancheLog } from '../../types/abi-interfaces/PoolManagerAbi'
import { TransferLog } from '../../types/abi-interfaces/Erc20Abi'
import { AccountService } from '../services/accountService'
import { PoolService } from '../services/poolService'
import { TrancheService } from '../services/trancheService'
import { InvestorTransactionData, InvestorTransactionService } from '../services/investorTransactionService'
import { CurrencyService } from '../services/currencyService'

export const handleEvmDeployTranche = errorHandler(_handleEvmDeployTranche)
async function _handleEvmDeployTranche(event: DeployTrancheLog): Promise<void> {
  const [_poolId, _trancheId, tokenAddress] = event.args

  const poolId = _poolId.toString()
  const trancheId = _trancheId.substring(0, 34)

  logger.info(`Adding DynamicSource for pool ${poolId}-${trancheId} token: ${tokenAddress}`)

  let pool = await PoolService.getById(poolId)
  if (pool === undefined) {
    pool = PoolService.seed(poolId)
    await pool.save()
  }

  let tranche = await TrancheService.getById(poolId, trancheId)
  if (tranche === undefined) {
    tranche = TrancheService.seed(poolId, trancheId)
    await tranche.save()
  }

  await createTrancheTrackerDatasource({ address: tokenAddress })
}

export const handleEvmTransfer = errorHandler(_handleEvmTransfer)
async function _handleEvmTransfer(event: TransferLog): Promise<void> {
  const [fromEvmAddress, toEvmAddress, amount] = event.args
  logger.info(`Transfer ${fromEvmAddress.toString()}-${toEvmAddress.toString()} of ${amount.toString()}`)

  const evmTokenAddress = event.address
  const chainId = parseInt(event.transaction.chainId, 10)

  const evmToken = await CurrencyService.getOrInit(evmTokenAddress)
  if (!evmToken) throw new Error('Unregistered EVM Token')

  const orderData: Omit<InvestorTransactionData, 'address'> = {
    poolId: evmToken.poolId,
    trancheId: evmToken.trancheId,
    //epochNumber: pool.currentEpoch,
    hash: event.transactionHash,
    timestamp: new Date(Number(event.block.timestamp) * 1000),
    //price: tranche.tokenPrice,
    amount: amount.toBigInt(),
  }

  if (fromEvmAddress.toString() !== evmTokenAddress) {
    const fromAddress = AccountService.evmToSubstrate(fromEvmAddress.toString(), chainId)
    const fromAccount = await AccountService.getOrInit(fromAddress)
    const txOut = InvestorTransactionService.transferOut({ ...orderData, address: fromAccount.id })
    await txOut.save()
  }

  if (toEvmAddress.toString() !== evmTokenAddress) {
    const toAddress = AccountService.evmToSubstrate(toEvmAddress.toString(), chainId)
    const toAccount = await AccountService.getOrInit(toAddress)
    const txIn = InvestorTransactionService.transferOut({ ...orderData, address: toAccount.id })
    await txIn.save()
  }
}