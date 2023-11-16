import * as base from './base';
import * as predefined from './predefined';

import { ConditionProps, Condition, ERR_INVALID_CONDITION_TYPE } from './condition';
import { ContractCondition, ContractConditionType, ContractConditionProps } from './base/contract';
import { CompoundCondition, CompoundConditionType, CompoundConditionProps } from './compound-condition';
import { TimeCondition, TimeConditionType, TimeConditionProps } from './base/time';
import { RpcCondition, RpcConditionType, RpcConditionProps } from './base/rpc';

export * as compound from './compound-condition';
export * as condition from './condition';
export * as conditionExpr from './condition-expr';

export class ConditionFactory {
  public static conditionFromProps(obj: ConditionProps): Condition {
    switch (obj.conditionType) {
      case RpcConditionType:
        return new RpcCondition(obj as RpcConditionProps);
      case TimeConditionType:
        return new TimeCondition(obj as TimeConditionProps);
      case ContractConditionType:
        return new ContractCondition(obj as ContractConditionProps);
      case CompoundConditionType:
        return new CompoundCondition(obj as CompoundConditionProps);
      default:
        throw new Error(ERR_INVALID_CONDITION_TYPE(obj.conditionType));
    }
  }
}

export * as context from './context';
export { base, predefined };
