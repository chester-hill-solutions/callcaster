import * as React from 'react';
import { DateValue, CalendarProps, CalendarCellRenderProps, RangeCalendarProps } from 'react-aria-components';
import { Button } from './button.js';
import 'class-variance-authority/types';
import 'class-variance-authority';

declare function Calendar<T extends DateValue, M extends "single" | "multiple" = "single">(props: Omit<CalendarProps<T, M>, "visibleDuration"> & {
    buttonVariant?: React.ComponentProps<typeof Button>["variant"];
    captionLayout?: "label" | "dropdown";
    numberOfMonths?: number;
    showWeekNumber?: boolean;
    headerFormat?: Intl.DateTimeFormatOptions;
    renderCell?: (renderProps: CalendarCellRenderProps & {
        defaultChildren: React.ReactNode;
    }) => React.ReactNode;
}): React.JSX.Element;
declare function RangeCalendar<T extends DateValue>(props: RangeCalendarProps<T> & {
    buttonVariant?: React.ComponentProps<typeof Button>["variant"];
    captionLayout?: "label" | "dropdown";
    headerFormat?: Intl.DateTimeFormatOptions;
    numberOfMonths?: number;
    showWeekNumber?: boolean;
    renderCell?: (renderProps: CalendarCellRenderProps & {
        defaultChildren: React.ReactNode;
    }) => React.ReactNode;
}): React.JSX.Element;

export { Calendar, RangeCalendar };
