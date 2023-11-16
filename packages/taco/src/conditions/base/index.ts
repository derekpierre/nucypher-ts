import { Condition, ConditionProps } from '../condition';

export type OmitConditionType<T> = Omit<T, 'conditionType'>;

export type ConditionOrProps = Condition | ConditionProps;

