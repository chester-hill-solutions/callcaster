import * as React from 'react';
import { TableProps, TableBodyProps, CellProps, TableFooterProps, ColumnProps, TableHeaderProps, RowProps } from 'react-aria-components';

declare function Table({ className, ...props }: TableProps): React.JSX.Element;
declare function TableHeader<T>({ className, ...props }: TableHeaderProps<T>): React.JSX.Element;
declare function TableBody<T>({ className, ...props }: TableBodyProps<T>): React.JSX.Element;
declare function TableFooter<T>({ className, ...props }: TableFooterProps<T>): React.JSX.Element;
declare function TableRow<T>({ className, ...props }: RowProps<T>): React.JSX.Element;
declare function TableHead({ className, ...props }: ColumnProps): React.JSX.Element;
declare function TableCell({ className, ...props }: CellProps): React.JSX.Element;
declare function TableCaption({ className, ...props }: React.ComponentProps<"figcaption">): React.JSX.Element;

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
