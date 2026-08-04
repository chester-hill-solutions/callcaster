import * as React from 'react';
import useEmblaCarousel, { UseEmblaCarouselType } from 'embla-carousel-react';
import { Button } from './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';
import 'react-aria-components';

type CarouselApi = UseEmblaCarouselType[1];
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>;
type CarouselOptions = UseCarouselParameters[0];
type CarouselPlugin = UseCarouselParameters[1];
type CarouselProps = {
    opts?: CarouselOptions;
    plugins?: CarouselPlugin;
    orientation?: "horizontal" | "vertical";
    setApi?: (api: CarouselApi) => void;
};
type CarouselContextProps = {
    carouselRef: ReturnType<typeof useEmblaCarousel>[0];
    api: ReturnType<typeof useEmblaCarousel>[1];
    scrollPrev: () => void;
    scrollNext: () => void;
    canScrollPrev: boolean;
    canScrollNext: boolean;
} & CarouselProps;
declare function useCarousel(): CarouselContextProps;
declare function Carousel({ orientation, opts, setApi, plugins, className, children, ...props }: React.ComponentProps<"div"> & CarouselProps): React.JSX.Element;
declare function CarouselContent({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CarouselItem({ className, ...props }: React.ComponentProps<"div">): React.JSX.Element;
declare function CarouselPrevious({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;
declare function CarouselNext({ className, variant, size, ...props }: React.ComponentProps<typeof Button>): React.JSX.Element;

export { Carousel, type CarouselApi, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, useCarousel };
