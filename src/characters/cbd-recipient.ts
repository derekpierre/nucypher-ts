import {
  Ciphertext,
  Context,
  DecryptionSharePrecomputed,
  DecryptionShareSimple,
  decryptWithSharedSecret,
  DkgPublicParameters,
  EncryptedThresholdDecryptionRequest,
  EncryptedThresholdDecryptionResponse,
  SessionSharedSecret,
  SessionStaticKey,
  SessionStaticSecret,
  ThresholdDecryptionRequest,
} from '@nucypher/nucypher-core';
import { ethers } from 'ethers';

import { DkgCoordinatorAgent, DkgParticipant } from '../agents/coordinator';
import { ConditionExpression } from '../conditions';
import {
  DkgRitual,
  getCombineDecryptionSharesFunction,
  getVariantClass,
} from '../dkg';
import { Porter } from '../porter';
import { fromHexString, fromJSON, toJSON } from '../utils';


export type CbdTDecDecrypterJSON = {
  porterUri: string;
  ritualId: number;
  dkgPublicParams: Uint8Array;
  threshold: number;
};

export class CbdTDecDecrypter {
  // private readonly verifyingKey: Keyring;

  private constructor(
    private readonly porter: Porter,
    private readonly ritualId: number,
    private readonly dkgPublicParams: DkgPublicParameters,
    private readonly threshold: number
  ) {}

  public static create(porterUri: string, dkgRitual: DkgRitual) {
    return new CbdTDecDecrypter(
      new Porter(porterUri),
      dkgRitual.id,
      dkgRitual.dkgPublicParams,
      dkgRitual.threshold
    );
  }

  // Retrieve and decrypt ciphertext using provider and condition set
  public async retrieveAndDecrypt(
    provider: ethers.providers.Web3Provider,
    conditionExpr: ConditionExpression,
    variant: number,
    ciphertext: Ciphertext,
    aad: Uint8Array
  ): Promise<readonly Uint8Array[]> {
    const decryptionShares = await this.retrieve(
      provider,
      conditionExpr,
      variant,
      ciphertext
    );

    const combineDecryptionSharesFn =
      getCombineDecryptionSharesFunction(variant);
    const sharedSecret = combineDecryptionSharesFn(decryptionShares);

    const plaintext = decryptWithSharedSecret(
      ciphertext,
      aad,
      sharedSecret,
      this.dkgPublicParams
    );
    return [plaintext];
  }

  // Retrieve decryption shares
  public async retrieve(
    provider: ethers.providers.Web3Provider,
    conditionExpr: ConditionExpression,
    variant: number,
    ciphertext: Ciphertext
  ): Promise<DecryptionSharePrecomputed[] | DecryptionShareSimple[]> {
    const dkgParticipants = await DkgCoordinatorAgent.getParticipants(
      provider,
      this.ritualId
    );
    const contextStr = await conditionExpr.buildContext(provider).toJson();
    const { sharedSecrets, encryptedRequests } = this.makeDecryptionRequests(
      this.ritualId,
      variant,
      ciphertext,
      conditionExpr,
      contextStr,
      dkgParticipants
    );

    const { encryptedResponses, errors } = await this.porter.cbdDecrypt(
      encryptedRequests,
      this.threshold
    );
    if (Object.entries(encryptedResponses).length < this.threshold) {
      // insufficient responses
      throw new Error(
        `Threshold of responses not met; CBD decryption failed with errors: ${JSON.stringify(
          errors
        )}`
      );
    }
    return this.makeDecryptionShares(
      encryptedResponses,
      sharedSecrets,
      variant,
      this.ritualId
    );
  }

  private makeDecryptionShares(
    encryptedResponses: Record<string, EncryptedThresholdDecryptionResponse>,
    sessionSharedSecret: Record<string, SessionSharedSecret>,
    variant: number,
    expectedRitualId: number
  ) {
    const decryptedResponses = Object.entries(encryptedResponses).map(
      ([ursula, encryptedResponse]) =>
        encryptedResponse.decrypt(sessionSharedSecret[ursula])
    );

    const ritualIds = decryptedResponses.map(({ ritualId }) => ritualId);
    if (ritualIds.some((ritualId) => ritualId !== expectedRitualId)) {
      throw new Error(
        `Ritual id mismatch. Expected ${expectedRitualId}, got ${ritualIds}`
      );
    }

    const decryptionShares = decryptedResponses.map(
      ({ decryptionShare }) => decryptionShare
    );

    const DecryptionShareType = getVariantClass(variant);
    return decryptionShares.map((share) =>
      DecryptionShareType.fromBytes(share)
    );
  }

  private makeDecryptionRequests(
    ritualId: number,
    variant: number,
    ciphertext: Ciphertext,
    conditionExpr: ConditionExpression,
    contextStr: string,
    dkgParticipants: Array<DkgParticipant>
  ): {
    sharedSecrets: Record<string, SessionSharedSecret>;
    encryptedRequests: Record<string, EncryptedThresholdDecryptionRequest>;
  } {
    const decryptionRequest = new ThresholdDecryptionRequest(
      ritualId,
      variant,
      ciphertext,
      conditionExpr.toWASMConditions(),
      new Context(contextStr)
    );

    const ephemeralSessionKey = this.makeSessionKey();

    // Compute shared secrets for each participant
    const sharedSecrets: Record<string, SessionSharedSecret> =
      Object.fromEntries(
        dkgParticipants.map(({ provider, decryptionRequestStaticKey }) => {
          const decKey = SessionStaticKey.fromBytes(
            fromHexString(decryptionRequestStaticKey)
          );
          const sharedSecret = ephemeralSessionKey.deriveSharedSecret(decKey);
          return [provider, sharedSecret];
        })
      );

    // Create encrypted requests for each participant
    const encryptedRequests: Record<
      string,
      EncryptedThresholdDecryptionRequest
    > = Object.fromEntries(
      Object.entries(sharedSecrets).map(([provider, sessionSharedSecret]) => {
        const encryptedRequest = decryptionRequest.encrypt(
          sessionSharedSecret,
          ephemeralSessionKey.publicKey()
        );
        return [provider, encryptedRequest];
      })
    );

    return { sharedSecrets, encryptedRequests };
  }

  private makeSessionKey() {
    // Moving to a separate function to make it easier to mock
    return SessionStaticSecret.random();
  }

  public toObj(): CbdTDecDecrypterJSON {
    return {
      porterUri: this.porter.porterUrl.toString(),
      ritualId: this.ritualId,
      dkgPublicParams: this.dkgPublicParams.toBytes(),
      threshold: this.threshold,
    };
  }

  public toJSON(): string {
    return toJSON(this.toObj());
  }

  public static fromObj({
    porterUri,
    ritualId,
    dkgPublicParams,
    threshold,
  }: CbdTDecDecrypterJSON) {
    return new CbdTDecDecrypter(
      new Porter(porterUri),
      ritualId,
      DkgPublicParameters.fromBytes(dkgPublicParams),
      threshold
    );
  }

  public static fromJSON(json: string) {
    return CbdTDecDecrypter.fromObj(fromJSON(json));
  }

  public equals(other: CbdTDecDecrypter): boolean {
    return (
      this.porter.porterUrl.toString() === other.porter.porterUrl.toString()
    );
  }
}
