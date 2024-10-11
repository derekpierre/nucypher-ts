import { ETH_ADDRESS_REGEXP } from '@nucypher/shared';
import { ethers } from 'ethers';
import { z } from 'zod';
import { AbiParameter } from 'abitype/zod';

import { paramOrContextParamSchema } from './context';
import { rpcConditionSchema } from './rpc';
import { parseAbi, parseAbiItem } from 'abitype';

const functionAbiSchema = z
  .object({
    name: z.string(),
    type: z.literal('function'),
    inputs: z.array(AbiParameter).min(0),
    outputs: z.array(AbiParameter).nonempty(),
    stateMutability: z.union([z.literal('view'), z.literal('pure')]),
  })
  .strict()
  .refine(
    (functionAbi) => {
      let asInterface;
      try {
        // `stringify` here because ethers.utils.Interface doesn't accept a Zod schema
        asInterface = new ethers.utils.Interface(JSON.stringify([functionAbi]));
      } catch (e) {
        return false;
      }

      const functionsInAbi = Object.values(asInterface.functions || {});
      return functionsInAbi.length === 1;
    },
    {
      message: '"functionAbi" must contain a single function definition',
      path: ['functionAbi'],
    },
  )
  .refine(
    (functionAbi) => {
      const asInterface = new ethers.utils.Interface(
        JSON.stringify([functionAbi]),
      );
      const nrOfInputs = asInterface.fragments[0].inputs.length;
      return functionAbi.inputs.length === nrOfInputs;
    },
    {
      message: '"parameters" must have the same length as "functionAbi.inputs"',
      path: ['parameters'],
    },
  );

export type FunctionAbiProps = z.infer<typeof functionAbiSchema>;

export const humanReadableAbiSchema = z
  .string().startsWith("function ")
  .refine(
    (abi) => {
      try {
        parseAbiItem(abi);
        return true;
      } catch (e) {
        return false;
      }
    },
    {
      message: 'Invalid Human-Readable ABI format',
    },
  )
  .transform(parseAbiItem);

export const ContractConditionType = 'contract';
export const contractConditionSchema = rpcConditionSchema
  .extend({
    conditionType: z
      .literal(ContractConditionType)
      .default(ContractConditionType),
    contractAddress: z.string().regex(ETH_ADDRESS_REGEXP).length(42),
    standardContractType: z.enum(['ERC20', 'ERC721']).optional(),
    method: z.string(),
    functionAbi: functionAbiSchema.optional(),
    parameters: z.array(paramOrContextParamSchema),
  })
  // Adding this custom logic causes the return type to be ZodEffects instead of ZodObject
  // https://github.com/colinhacks/zod/issues/2474
  .refine(
    // A check to see if either 'standardContractType' or 'functionAbi' is set
    (data) => Boolean(data.standardContractType) !== Boolean(data.functionAbi),
    {
      message:
        "At most one of the fields 'standardContractType' and 'functionAbi' must be defined",
      path: ['standardContractType'],
    },
  );

export type ContractConditionProps = z.infer<typeof contractConditionSchema>;
