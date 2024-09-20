import { describe, expect, it } from 'vitest';

import { CompoundConditionType } from '../../src/conditions/compound-condition';
import { SUPPORTED_CHAIN_IDS } from '../../src/conditions/const';
import {
  ConditionVariableProps,
  SequentialCondition,
  SequentialConditionProps,
  sequentialConditionSchema,
  SequentialConditionType,
} from '../../src/conditions/sequential';
import {
  testCompoundConditionObj,
  testContractConditionObj,
  testRpcConditionObj,
  testSequentialConditionObj,
  testTimeConditionObj,
} from '../test-utils';

describe('validation', () => {
  const rpcConditionVariable: ConditionVariableProps = {
    varName: 'rpc',
    condition: testRpcConditionObj,
  };
  const timeConditionVariable: ConditionVariableProps = {
    varName: 'time',
    condition: testTimeConditionObj,
  };
  const contractConditionVariable: ConditionVariableProps = {
    varName: 'contract',
    condition: testContractConditionObj,
  };
  const compoundConditionVariable: ConditionVariableProps = {
    varName: 'compound',
    condition: testCompoundConditionObj,
  };
  const sequentialConditionVariable: ConditionVariableProps = {
    varName: 'nestedSequential',
    condition: testSequentialConditionObj,
  };

  it('rejects no varName', () => {
    const result = SequentialCondition.validate(sequentialConditionSchema, {
      conditionVariables: [
        rpcConditionVariable,
        {
          condition: testTimeConditionObj,
        },
      ],
    });

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      conditionVariables: {
        '1': {
          varName: {
            _errors: ['Required'],
          },
        },
      },
    });
  });

  it('rejects > max number of condition variables', () => {
    const tooManyConditionVariables = new Array(6);
    for (let i = 0; i < tooManyConditionVariables.length; i++) {
      tooManyConditionVariables[i] = {
        varName: `var${i}`,
        condition: testRpcConditionObj,
      };
    }
    const result = SequentialCondition.validate(sequentialConditionSchema, {
      conditionVariables: tooManyConditionVariables,
    });

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      conditionVariables: {
        _errors: [`Array must contain at most 5 element(s)`],
      },
    });
  });

  it('accepts nested compound conditions', () => {
    const conditionObj = {
      conditionType: SequentialConditionType,
      conditionVariables: [
        rpcConditionVariable,
        timeConditionVariable,
        contractConditionVariable,
        compoundConditionVariable,
      ],
    };
    const result = SequentialCondition.validate(
      sequentialConditionSchema,
      conditionObj,
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      conditionType: SequentialConditionType,
      conditionVariables: [
        rpcConditionVariable,
        timeConditionVariable,
        contractConditionVariable,
        compoundConditionVariable,
      ],
    });
  });

  it('accepts nested sequential and compound conditions', () => {
    const conditionObj = {
      conditionType: SequentialConditionType,
      conditionVariables: [
        rpcConditionVariable,
        timeConditionVariable,
        contractConditionVariable,
        compoundConditionVariable,
        sequentialConditionVariable,
      ],
    };
    const result = SequentialCondition.validate(
      sequentialConditionSchema,
      conditionObj,
    );
    expect(result.error).toBeUndefined();
    expect(result.data).toEqual({
      conditionType: SequentialConditionType,
      conditionVariables: [
        rpcConditionVariable,
        timeConditionVariable,
        contractConditionVariable,
        compoundConditionVariable,
        sequentialConditionVariable,
      ],
    });
  });

  it('limits max depth of nested compound condition', () => {
    const result = SequentialCondition.validate(sequentialConditionSchema, {
      conditionVariables: [
        rpcConditionVariable,
        contractConditionVariable,
        {
          varName: 'compound',
          condition: {
            conditionType: CompoundConditionType,
            operator: 'not',
            operands: [
              {
                conditionType: CompoundConditionType,
                operator: 'and',
                operands: [testTimeConditionObj, testRpcConditionObj],
              },
            ],
          },
        },
      ],
    });
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      conditionVariables: {
        _errors: [`Exceeded max nested depth of 2 for multi-condition type`],
      },
    });
  });

  it('limits max depth of nested sequential condition', () => {
    const result = SequentialCondition.validate(sequentialConditionSchema, {
      conditionVariables: [
        rpcConditionVariable,
        contractConditionVariable,
        {
          varName: 'sequentialNested',
          condition: {
            conditionType: SequentialConditionType,
            conditionVariables: [
              timeConditionVariable,
              sequentialConditionVariable,
            ],
          },
        },
      ],
    });
    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
    expect(result.error?.format()).toMatchObject({
      conditionVariables: {
        _errors: ['Exceeded max nested depth of 2 for multi-condition type'],
      },
    });
  });

  it('accepts on a valid multichain condition schema', () => {
    const multichainCondition: SequentialConditionProps = {
      conditionType: SequentialConditionType,
      conditionVariables: SUPPORTED_CHAIN_IDS.map((chain) => ({
        varName: `chain_${chain}`,
        condition: {
          ...testRpcConditionObj,
          chain,
        },
      })),
    };

    const result = SequentialCondition.validate(
      sequentialConditionSchema,
      multichainCondition,
    );

    expect(result.error).toBeUndefined();
    expect(result.data).toEqual(multichainCondition);
  });

  it('rejects an invalid multichain condition schema', () => {
    const badMultichainCondition: SequentialConditionProps = {
      conditionType: SequentialConditionType,
      conditionVariables: [
        {
          varName: 'chain_1',
          condition: {
            ...testRpcConditionObj,
            chain: 1,
          },
        },
        {
          varName: 'chain_137',
          condition: {
            ...testRpcConditionObj,
            chain: 137,
          },
        },
        {
          varName: `invalid_chain`,
          condition: {
            ...testRpcConditionObj,
            chain: -1,
          },
        },
      ],
    };

    const result = SequentialCondition.validate(
      sequentialConditionSchema,
      badMultichainCondition,
    );

    expect(result.error).toBeDefined();
    expect(result.data).toBeUndefined();
  });

  it('infers default condition type from constructor', () => {
    const condition = new SequentialCondition({
      conditionVariables: [
        contractConditionVariable,
        timeConditionVariable,
        rpcConditionVariable,
      ],
    });
    expect(condition.value.conditionType).toEqual(SequentialConditionType);
  });
});
