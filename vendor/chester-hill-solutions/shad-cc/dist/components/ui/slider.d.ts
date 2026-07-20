import * as React from 'react';
import { SliderProps as SliderProps$1 } from 'react-aria-components';

type SliderValue = number | number[];
type SliderProps<T extends SliderValue = SliderValue> = Omit<SliderProps$1<T>, "className"> & {
    className?: string;
};
declare function Slider<T extends SliderValue = SliderValue>({ className, ...props }: SliderProps<T>): React.JSX.Element;

export { Slider };
