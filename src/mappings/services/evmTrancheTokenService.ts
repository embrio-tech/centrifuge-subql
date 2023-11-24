import { EvmTrancheToken } from '../../types/models/EvmTrancheToken'

export class EvmTrancheTokenService extends EvmTrancheToken {
  static init(tokenAddress: string, chainId: number, poolId: string, trancheId: string) {
    logger.info(`Initialising EVM Tranche Token: ${tokenAddress}`)
    return new this(tokenAddress, chainId, poolId, trancheId)
  }

  static async getById(tokenId: string) {
    const token = (await this.get(tokenId)) as EvmTrancheTokenService
    return token
  }
}
