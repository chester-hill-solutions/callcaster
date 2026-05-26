import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";

describe("app/components/ui primitives", () => {
  test("accordion", async () => {
    const { Accordion, AccordionContent, AccordionItem, AccordionTrigger } =
      await import("@/components/ui/accordion");
    render(
      <Accordion type="single" collapsible defaultValue="a">
        <AccordionItem value="a">
          <AccordionTrigger>One</AccordionTrigger>
          <AccordionContent>Body</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.getByText("One")).toBeInTheDocument();
    fireEvent.click(screen.getByText("One"));
  });

  test("alert", async () => {
    const { Alert, AlertDescription, AlertTitle } = await import("@/components/ui/alert");
    render(
      <Alert>
        <AlertTitle>T</AlertTitle>
        <AlertDescription>D</AlertDescription>
      </Alert>,
    );
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  test("badge variants", async () => {
    const { Badge } = await import("@/components/ui/badge");
    const { unmount } = render(<Badge>Default</Badge>);
    expect(screen.getByText("Default")).toBeInTheDocument();
    unmount();
    render(<Badge variant="destructive">X</Badge>);
    render(<Badge variant="outline">Y</Badge>);
    render(<Badge variant="secondary">Z</Badge>);
  });

  test("calendar", async () => {
    const { Calendar } = await import("@/components/ui/calendar");
    const { container, unmount } = render(
      <Calendar mode="single" selected={new Date("2024-01-15")} onSelect={vi.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
    unmount();
  });

  test("card parts", async () => {
    const {
      Card,
      CardContent,
      CardDescription,
      CardFooter,
      CardHeader,
      CardTitle,
    } = await import("@/components/ui/card");
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Desc</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    );
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  test("checkbox and switch", async () => {
    const { Checkbox } = await import("@/components/ui/checkbox");
    const { Switch } = await import("@/components/ui/switch");
    const onChecked = vi.fn();
    render(<Checkbox checked onCheckedChange={onChecked} aria-label="cb" />);
    render(<Switch checked onCheckedChange={onChecked} aria-label="sw" />);
    fireEvent.click(screen.getByLabelText("cb"));
    fireEvent.click(screen.getByLabelText("sw"));
  });

  test("command", async () => {
    const {
      Command,
      CommandEmpty,
      CommandGroup,
      CommandInput,
      CommandItem,
      CommandList,
    } = await import("@/components/ui/command");
    render(
      <Command>
        <CommandInput placeholder="Search" />
        <CommandList>
          <CommandEmpty>None</CommandEmpty>
          <CommandGroup heading="G">
            <CommandItem>Item</CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>,
    );
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });

  test("dialog", async () => {
    const {
      Dialog,
      DialogContent,
      DialogDescription,
      DialogFooter,
      DialogHeader,
      DialogTitle,
      DialogTrigger,
    } = await import("@/components/ui/dialog");
    render(
      <Dialog open>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>T</DialogTitle>
            <DialogDescription>D</DialogDescription>
          </DialogHeader>
          <DialogFooter>F</DialogFooter>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByText("T")).toBeInTheDocument();
  });

  test("dropdown-menu", async () => {
    const {
      DropdownMenu,
      DropdownMenuCheckboxItem,
      DropdownMenuContent,
      DropdownMenuItem,
      DropdownMenuLabel,
      DropdownMenuSeparator,
      DropdownMenuTrigger,
    } = await import("@/components/ui/dropdown-menu");
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>L</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>Item</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Check</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    expect(screen.getByText("Item")).toBeInTheDocument();
  });

  test("form-field", async () => {
    const { FormField } = await import("@/components/ui/form-field");
    const { Input } = await import("@/components/ui/input");
    render(
      <FormField label="Email" description="Hint" error="Err">
        <Input />
      </FormField>,
    );
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Err")).toBeInTheDocument();
    render(
      <FormField label="X">
        <Input />
      </FormField>,
    );
  });

  test("pagination", async () => {
    const {
      Pagination,
      PaginationContent,
      PaginationEllipsis,
      PaginationItem,
      PaginationLink,
      PaginationNext,
      PaginationPrevious,
    } = await import("@/components/ui/pagination");
    render(
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              1
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
      </Pagination>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  test("popover and tooltip", async () => {
    const { Popover, PopoverContent, PopoverTrigger } = await import("@/components/ui/popover");
    const { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } =
      await import("@/components/ui/tooltip");
    render(
      <TooltipProvider>
        <Popover open>
          <PopoverTrigger>P</PopoverTrigger>
          <PopoverContent>Pop</PopoverContent>
        </Popover>
        <Tooltip open>
          <TooltipTrigger>T</TooltipTrigger>
          <TooltipContent>Tip</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getAllByText("Pop")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Tip")[0]).toBeInTheDocument();
  });

  test("progress spinner skeleton", async () => {
    const { Progress } = await import("@/components/ui/progress");
    const { Spinner } = await import("@/components/ui/spinner");
    const { Skeleton } = await import("@/components/ui/skeleton");
    render(<Progress value={40} />);
    render(<Progress value={null as never} />);
    render(<Spinner />);
    render(<Skeleton className="h-4 w-4" />);
  });

  test("select", async () => {
    const {
      Select,
      SelectContent,
      SelectItem,
      SelectTrigger,
      SelectValue,
    } = await import("@/components/ui/select");
    const onChange = vi.fn();
    render(
      <Select value="a" onValueChange={onChange}>
        <SelectTrigger aria-label="sel">
          <SelectValue placeholder="Pick" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
          <SelectItem value="b">B</SelectItem>
        </SelectContent>
      </Select>,
    );
    fireEvent.click(screen.getByLabelText("sel"));
    fireEvent.click(screen.getByText("B"));
    expect(onChange).toHaveBeenCalledWith("b");
  });

  test("sheet", async () => {
    const {
      Sheet,
      SheetContent,
      SheetDescription,
      SheetFooter,
      SheetHeader,
      SheetTitle,
      SheetTrigger,
    } = await import("@/components/ui/sheet");
    render(
      <Sheet open>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>T</SheetTitle>
            <SheetDescription>D</SheetDescription>
          </SheetHeader>
          <SheetFooter>F</SheetFooter>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByText("T")).toBeInTheDocument();
    const { unmount } = render(
      <Sheet open>
        <SheetContent side="left">L</SheetContent>
      </Sheet>,
    );
    unmount();
  });

  test("table", async () => {
    const {
      Table,
      TableBody,
      TableCaption,
      TableCell,
      TableFooter,
      TableHead,
      TableHeader,
      TableRow,
    } = await import("@/components/ui/table");
    render(
      <Table>
        <TableCaption>Cap</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>H</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>C</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>F</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  test("tabs", async () => {
    const { Tabs, TabsContent, TabsList, TabsTrigger } = await import("@/components/ui/tabs");
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
          <TabsTrigger value="b">B</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Tab A</TabsContent>
        <TabsContent value="b">Tab B</TabsContent>
      </Tabs>,
    );
    expect(screen.getByText("Tab A")).toBeInTheDocument();
    fireEvent.click(screen.getByText("B"));
  });

  test("textarea", async () => {
    const { Textarea } = await import("@/components/ui/textarea");
    render(<Textarea defaultValue="hi" aria-label="ta" />);
    fireEvent.change(screen.getByLabelText("ta"), { target: { value: "bye" } });
  });

  test("typography", async () => {
    const { Heading, Text } = await import("@/components/ui/typography");
    render(
      <>
        <Heading level={2} branded>
          H
        </Heading>
        <Text variant="muted">Muted</Text>
        <Text as="span" variant="lead">
          Lead
        </Text>
      </>,
    );
    expect(screen.getByText("H")).toBeInTheDocument();
  });

  test("datetime picker renders", async () => {
    const { DateTimePicker } = await import("@/components/ui/datetime");
    const onChange = vi.fn();
    const { unmount } = render(
      <DateTimePicker value={new Date("2024-06-01T10:00:00")} onChange={onChange} />,
    );
    expect(document.querySelector("button")).toBeTruthy();
    unmount();
  });
});
