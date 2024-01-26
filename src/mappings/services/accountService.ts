import { Account } from '../../types/models/Account'
import { BlockchainService } from './blockchainService'

const EVM_SUFFIX = '45564d00'

export class AccountService extends Account {
  static async init(address: string) {
    logger.info(`Initialising new account: ${address}`)
    if (this.isLiquidityPoolInvestor(address)) {
      const chainId = this.readEvmChainId(address)
      const account = new this(address, chainId)
      account.evmAddress = address.substring(0, 42)
      return account
    } else {
      return new this(address, await getNodeChainId())
    }
  }

  static async getOrInit(address: string, blockchainService = BlockchainService): Promise<AccountService> {
    let account = (await this.get(address)) as AccountService
    if (!account) {
      account = await this.init(address)
      await blockchainService.getOrInit(account.chainId)
      await account.save()
    }
    return account
  }

  static evmToSubstrate(evmAddress: string, chainId: string) {
    const chainHex = parseInt(chainId,10).toString(16).padStart(4, '0')
    return `0x${evmAddress.substring(2).toLowerCase()}000000000000${chainHex}${EVM_SUFFIX}`
  }

  static readEvmChainId(address: string) {
    return parseInt(address.slice(-12, -8), 16).toString(10)
  }

  static isLiquidityPoolInvestor(address: string) {
    return address.length === 66 && address.endsWith(EVM_SUFFIX)
  }

  public isLiquidityPoolInvestor() {
    return AccountService.isLiquidityPoolInvestor(this.id)
  }
}
