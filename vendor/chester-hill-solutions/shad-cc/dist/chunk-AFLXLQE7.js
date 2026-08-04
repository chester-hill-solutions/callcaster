import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from './chunk-2FYTT6NB.js';
import { Button, buttonVariants } from './chunk-727NWYDA.js';
import { cn } from './chunk-DN2AEEA2.js';
import 'react';
import { cva } from 'class-variance-authority';
import { Calendar as Calendar$1, RangeCalendar as RangeCalendar$1, CalendarHeading, CalendarGrid, CalendarGridHeader, CalendarHeaderCell, CalendarGridBody, CalendarCell, CalendarMonthPicker, CalendarYearPicker } from 'react-aria-components';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { jsx, jsxs, Fragment } from 'react/jsx-runtime';

var cellVariants = cva(
  "group/day relative mt-2 aspect-square h-full w-full cursor-default rounded-(--cell-radius) p-0 text-center select-none [&:is(:last-child>[data-selected=true])>div]:rounded-r-(--cell-radius)",
  {
    variants: {
      showWeekNumber: {
        false: "[&:is(:first-child>[data-selected=true])>div]:rounded-l-(--cell-radius)",
        true: "[&:is(:nth-child(2)>[data-selected=true])>div]:rounded-l-(--cell-radius)"
      },
      isToday: {
        true: "rounded-(--cell-radius) bg-muted text-foreground data-[selected=true]:rounded-none"
      },
      isSelectionStart: {
        true: "relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted"
      },
      isSelectionEnd: {
        true: "relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted"
      },
      isUnavailable: {
        true: "text-muted-foreground opacity-50 [&>div]:line-through"
      },
      isDisabled: {
        true: "text-muted-foreground opacity-50"
      },
      isOutsideMonth: {
        true: "text-muted-foreground aria-selected:text-muted-foreground"
      }
    }
  }
);
function Calendar(props) {
  return /* @__PURE__ */ jsx(
    Calendar$1,
    {
      ...props,
      "data-slot": "calendar",
      visibleDuration: { months: props.numberOfMonths || 1 },
      className: cn(
        "group/calendar w-fit bg-background p-3 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        props.className
      ),
      children: /* @__PURE__ */ jsx(CalendarInner, { ...props })
    }
  );
}
function RangeCalendar(props) {
  return /* @__PURE__ */ jsx(
    RangeCalendar$1,
    {
      ...props,
      "data-slot": "calendar",
      visibleDuration: { months: props.numberOfMonths || 1 },
      className: cn(
        "group/calendar w-fit bg-background p-3 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent",
        props.className
      ),
      children: /* @__PURE__ */ jsx(CalendarInner, { ...props, isRange: true })
    }
  );
}
function CalendarInner({
  captionLayout = "label",
  buttonVariant = "ghost",
  numberOfMonths = 1,
  showWeekNumber = false,
  headerFormat,
  renderCell,
  isRange
}) {
  return /* @__PURE__ */ jsxs("div", { className: "relative flex flex-col gap-4 md:flex-row", children: [
    /* @__PURE__ */ jsxs("div", { className: "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1", children: [
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: buttonVariant,
          slot: "previous",
          className: "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          children: /* @__PURE__ */ jsx(ChevronLeftIcon, { className: "size-4" })
        }
      ),
      /* @__PURE__ */ jsx(
        Button,
        {
          variant: buttonVariant,
          slot: "next",
          className: "size-(--cell-size) p-0 select-none aria-disabled:opacity-50",
          children: /* @__PURE__ */ jsx(ChevronRightIcon, { className: "size-4" })
        }
      )
    ] }),
    Array.from({ length: numberOfMonths }, (_, i) => /* @__PURE__ */ jsxs("div", { className: "flex w-full flex-col gap-4", children: [
      /* @__PURE__ */ jsx("div", { className: "flex h-(--cell-size) w-full items-center justify-center gap-1 px-(--cell-size)", children: captionLayout === "dropdown" ? /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(MonthDropdown, { format: headerFormat }),
        /* @__PURE__ */ jsx(YearDropdown, { format: headerFormat })
      ] }) : /* @__PURE__ */ jsx(
        CalendarHeading,
        {
          offset: { months: i },
          format: headerFormat,
          className: "font-heading text-sm font-semibold select-none"
        }
      ) }),
      /* @__PURE__ */ jsxs(
        CalendarGrid,
        {
          className: "w-full border-collapse",
          offset: { months: i },
          children: [
            /* @__PURE__ */ jsx(CalendarGridHeader, { children: (day) => /* @__PURE__ */ jsx(CalendarHeaderCell, { className: "rounded-(--cell-radius) text-[0.8rem] font-normal text-muted-foreground select-none", children: day }) }),
            /* @__PURE__ */ jsx(CalendarGridBody, { children: (date) => /* @__PURE__ */ jsx(
              CalendarCell,
              {
                date,
                className: (renderProps) => cellVariants({ ...renderProps, showWeekNumber }),
                children: (renderProps) => /* @__PURE__ */ jsx(
                  "div",
                  {
                    "data-selected-single": renderProps.isSelected && !isRange,
                    "data-range-start": renderProps.isSelectionStart && isRange,
                    "data-range-end": renderProps.isSelectionEnd && isRange,
                    "data-range-middle": renderProps.isSelected && !renderProps.isSelectionStart && !renderProps.isSelectionEnd && isRange,
                    className: cn(
                      buttonVariants({ variant: "ghost", size: "icon" }),
                      "relative isolate z-10 flex aspect-square h-full w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-muted data-[range-middle=true]:text-foreground data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70"
                    ),
                    children: renderCell ? renderCell(renderProps) : renderProps.defaultChildren
                  }
                )
              }
            ) })
          ]
        }
      )
    ] }, i))
  ] });
}
function MonthDropdown({ format }) {
  return /* @__PURE__ */ jsx(CalendarMonthPicker, { format: format?.month, children: (props) => /* @__PURE__ */ jsxs(Select, { ...props, className: "relative", children: [
    /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
    /* @__PURE__ */ jsx(SelectContent, { className: "min-w-0", children: /* @__PURE__ */ jsx(SelectGroup, { children: props.items.map((item) => /* @__PURE__ */ jsx(SelectItem, { id: item.id, children: item.formatted }, item.id)) }) })
  ] }) });
}
function YearDropdown({ format }) {
  return /* @__PURE__ */ jsx(CalendarYearPicker, { format, children: (props) => /* @__PURE__ */ jsxs(Select, { ...props, className: "relative", children: [
    /* @__PURE__ */ jsx(SelectTrigger, { children: /* @__PURE__ */ jsx(SelectValue, {}) }),
    /* @__PURE__ */ jsx(SelectContent, { className: "min-w-0", children: props.items.map((item) => /* @__PURE__ */ jsx(SelectItem, { id: item.id, children: item.formatted }, item.id)) })
  ] }) });
}

export { Calendar, RangeCalendar };
//# sourceMappingURL=chunk-AFLXLQE7.js.map
//# sourceMappingURL=chunk-AFLXLQE7.js.map