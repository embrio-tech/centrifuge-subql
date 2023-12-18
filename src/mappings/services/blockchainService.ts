import { Blockchain } from '../../types/models/Blockchain'

const thisChainId = '2030'
export class BlockchainService extends Blockchain {
  static init(chainId: string) {
    logger.info(`Initialising new blockchain with evm Id ${chainId}`)
    return new this(chainId)
  }

  static async getOrInit(chainId?: string) {
    let blockchain = await this.get(chainId ?? await this.getThisChainId())
    if (!blockchain) {
      blockchain = this.init(chainId ?? await this.getThisChainId())
      await blockchain.save()
    }
    return blockchain as BlockchainService
  }

  static async getThisChainId() {
    return thisChainId
  }
}
