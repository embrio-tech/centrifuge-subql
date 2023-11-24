import { createTrancheTrackerDatasource } from '../../types'
import { errorHandler } from '../../helpers/errorHandler'
import { DeployTrancheLog } from '../../types/abi-interfaces/PoolManagerAbi'
import { TransferLog } from '../../types/abi-interfaces/Erc20Abi'
import { EvmAccountService } from '../services/evmAccountService'
import { AccountService } from '../services/accountService'
import { PoolService } from '../services/poolService'
import { TrancheService } from '../services/trancheService'
import { EvmTrancheTokenService } from '../services/evmTrancheTokenService'
import { InvestorTransactionData, InvestorTransactionService } from '../services/investorTransactionService'

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

  const evmToken = await EvmTrancheTokenService.getById(evmTokenAddress)

  const orderData: Omit<InvestorTransactionData,'address'> = {
    poolId: evmToken.poolId,
    trancheId: evmToken.trancheId,
    //epochNumber: pool.currentEpoch,
    hash: event.transactionHash,
    timestamp: new Date(Number(event.block.timestamp)*1000),
    //price: tranche.tokenPrice,
    amount: amount.toBigInt(),
  }

  if (fromEvmAddress.toString() !== evmTokenAddress) {
    const fromAddress = EvmAccountService.convertToSubstrate(fromEvmAddress.toString(), chainId)

    let fromEvmAccount = (
      await EvmAccountService.getByFields(
        [
          ['id', '=', fromEvmAddress.toString()],
          ['chainId', '=', chainId],
        ],
        { limit: 1 }
      )
    ).pop()

    let fromAccount: AccountService = undefined
    if (fromEvmAccount) {
      fromAccount = (await AccountService.get(fromEvmAccount.accountId)) as AccountService
    } else {
      fromAccount = await AccountService.getOrInit(fromAddress)
      fromEvmAccount = new EvmAccountService(fromEvmAddress, fromAccount.id, chainId)
    }
    const txOut = InvestorTransactionService.transferOut({ ...orderData, address: fromAccount.id })
    await txOut.save()
  }

  if (toEvmAddress.toString() !== evmTokenAddress) {
    const toAddress = EvmAccountService.convertToSubstrate(toEvmAddress.toString(), chainId)

    let toEvmAccount = (
      await EvmAccountService.getByFields(
        [
          ['id', '=', toEvmAddress.toString()],
          ['chainId', '=', chainId],
        ],
        { limit: 1 }
      )
    ).pop()

    let toAccount: AccountService = undefined
    if (toEvmAccount) {
      toAccount = (await AccountService.get(toEvmAccount.accountId)) as AccountService
    } else {
      toAccount = await AccountService.getOrInit(toAddress)
      toEvmAccount = new EvmAccountService(toEvmAddress, toAccount.id, chainId)
    }
    const txIn = InvestorTransactionService.transferOut({ ...orderData, address: toAccount.id })
    await txIn.save()
  }
}
