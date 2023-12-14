import { Blockchain } from '../../types/models/Blockchain'

const thisChainIdPromise = api.rpc.eth.chainId()

export class BlockchainService extends Blockchain {
  static init(chainId: string) {
    logger.info(`Initialising new blockchain with evm Id ${chainId}`)
    return new this(chainId)
  }

  static async getOrInit(chainId?: string) {
    let blockchain = await this.get(chainId ?? await BlockchainService.getThischainId())
    if (!blockchain) {
      blockchain = this.init(chainId)
      await blockchain.save()
    }
    return blockchain as BlockchainService
  }

  static async getThischainId() {
    return (await thisChainIdPromise).toString(10)
  }
}
