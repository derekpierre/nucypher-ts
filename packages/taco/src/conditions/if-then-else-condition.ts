import { z } from 'zod';

import { contractConditionSchema } from './base/contract';
import { rpcConditionSchema } from './base/rpc';
import { timeConditionSchema } from './base/time';
import { compoundConditionSchema } from './compound-condition';
import { baseConditionSchema, Condition } from './condition';
import { maxNestedDepth } from './multi-condition';
import { sequentialConditionSchema } from './sequential';
import { OmitConditionType } from './shared';

export const IfThenElseConditionType = 'if-then-else';

export const ifThenElseConditionSchema: z.ZodSchema = baseConditionSchema
  .extend({
    conditionType: z
      .literal(IfThenElseConditionType)
      .default(IfThenElseConditionType),
    ifCondition: z.lazy(() =>
      z.union([
        rpcConditionSchema,
        timeConditionSchema,
        contractConditionSchema,
        compoundConditionSchema,
        sequentialConditionSchema,
        ifThenElseConditionSchema,
      ]),
    ),
    thenCondition: z.lazy(() =>
      z.union([
        rpcConditionSchema,
        timeConditionSchema,
        contractConditionSchema,
        compoundConditionSchema,
        sequentialConditionSchema,
        ifThenElseConditionSchema,
      ]),
    ),
    elseCondition: z.lazy(() =>
      z.union([
        // Condition
        rpcConditionSchema,
        timeConditionSchema,
        contractConditionSchema,
        compoundConditionSchema,
        sequentialConditionSchema,
        ifThenElseConditionSchema,
        // boolean
        z.boolean(),
      ]),
    ),
  })
  .refine(
    (condition) => maxNestedDepth(2)(condition),
    {
      message: 'Exceeded max nested depth of 2 for multi-condition type',
    }, // Max nested depth of 2
  );

export type IfThenElseConditionProps = z.infer<
  typeof ifThenElseConditionSchema
>;

export class IfThenElseCondition extends Condition {
  constructor(value: OmitConditionType<IfThenElseConditionProps>) {
    super(sequentialConditionSchema, {
      conditionType: IfThenElseConditionType,
      ...value,
    });
  }
}
