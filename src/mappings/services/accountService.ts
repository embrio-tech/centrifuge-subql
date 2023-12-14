import { Account } from '../../types/models/Account'

const EVM_SUFFIX = '45564d00'

export class AccountService extends Account {
  static async init(address: string) {
    logger.info(`Initialising new account: ${address}`)
    if (this.isEvm(address)) {
      const chainId = this.readEvmChainId(address)
      const account = new this(address, chainId)
      account.evmAddress = address.substring(0, 42)
      return account
    } else {
      const chainId = (await api.rpc.eth.chainId()).toString()
      return new this(address, chainId)
    }
  }

  static async getOrInit(address: string): Promise<AccountService> {
    let account = (await this.get(address)) as AccountService
    if (account === undefined) {
      account = await this.init(address)
      await account.save()
    }
    return account
  }

  static evmToSubstrate(evmAddress: string, chainId: string) {
    const chainHex = parseInt(chainId,10).toString(16).padStart(4, '0')
    return `0x${evmAddress.substring(2).toLowerCase()}000000000000${chainHex}${EVM_SUFFIX}`
  }

  static readEvmChainId(evmAddress: string) {
    return parseInt(evmAddress.slice(-12, -8), 16).toString(10)
  }

  static isEvm(address: string) {
    return address.length === 66 && address.endsWith(EVM_SUFFIX)
  }

  public isEvm() {
    return AccountService.isEvm(this.id)
  }
}
