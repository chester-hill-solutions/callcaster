import { type SliderProps as SliderPrimitiveProps } from "react-aria-components";
type SliderValue = number | number[];
type SliderProps<T extends SliderValue = SliderValue> = Omit<SliderPrimitiveProps<T>, "className"> & {
    className?: string;
};
declare function Slider<T extends SliderValue = SliderValue>({ className, ...props }: SliderProps<T>): import("react").JSX.Element;
export { Slider };
