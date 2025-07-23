import { useState, useMemo, useEffect } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "~/components/ui/card";
import {
  Filter,
  X,
  Search,
  Calendar,
  Clock,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

// Generic filter interface
export interface FilterConfig {
  key: string;
  label: string;
  type: 'search' | 'select' | 'date' | 'duration';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  icon?: React.ComponentType<{ className?: string }>;
}

// Filter values interface
export interface FilterValues {
  [key: string]: string;
}

// Props for the component
export interface DataTableFiltersProps<T> {
  data: T[];
  filterConfigs: FilterConfig[];
  onFiltersChange: (filteredData: T[]) => void;
  getFilterOptions?: (data: T[]) => Record<string, string[]>;
  customFilterLogic?: (item: T, filters: FilterValues) => boolean;
  title?: string;
  className?: string;
}

export function DataTableFilters<T>({
  data,
  filterConfigs,
  onFiltersChange,
  getFilterOptions,
  customFilterLogic,
  title = "Filters",
  className = "",
}: DataTableFiltersProps<T>) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [showFilters, setShowFilters] = useState(false);

  // Initialize filters from configs
  useMemo(() => {
    const initialFilters: FilterValues = {};
    filterConfigs.forEach(config => {
      initialFilters[config.key] = "";
    });
    setFilters(initialFilters);
  }, [filterConfigs]);

  // Get filter options if provided
  const filterOptions = useMemo(() => {
    return getFilterOptions ? getFilterOptions(data) : {};
  }, [data, getFilterOptions]);

  // Default filter logic
  const defaultFilterLogic = (item: T, filters: FilterValues): boolean => {
    // This is a basic implementation - custom logic should be provided for specific use cases
    return true;
  };

  // Apply filters to data
  const filteredData = useMemo(() => {
    const filterLogic = customFilterLogic || defaultFilterLogic;
    return data.filter(item => filterLogic(item, filters));
  }, [data, filters, customFilterLogic]);

  // Update parent component when filtered data changes
  useEffect(() => {
    onFiltersChange(filteredData);
  }, [filteredData, onFiltersChange]);

  // Clear all filters
  const clearFilters = () => {
    const clearedFilters: FilterValues = {};
    filterConfigs.forEach(config => {
      clearedFilters[config.key] = "";
    });
    setFilters(clearedFilters);
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filters).some(value => value !== "");

  // Update a specific filter
  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Render filter input based on type
  const renderFilterInput = (config: FilterConfig) => {
    const { key, type, placeholder, options, icon: Icon } = config;

    switch (type) {
      case 'search':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={placeholder || "Search..."}
                value={filters[key] || ""}
                onChange={(e) => updateFilter(key, e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <Select
              value={filters[key] || ""}
              onValueChange={(value) => updateFilter(key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={placeholder || `All ${config.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {filterOptions[key]?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'date':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={filters[key] || ""}
                onChange={(e) => updateFilter(key, e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        );

      case 'duration':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <Select
              value={filters[key] || ""}
              onValueChange={(value) => updateFilter(key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={placeholder || "All durations"} />
              </SelectTrigger>
                <SelectContent>
                <SelectItem value="short">Short (&lt; 1 min)</SelectItem>
                <SelectItem value="medium">Medium (1-5 min)</SelectItem>
                <SelectItem value="long">Long (&gt; 5 min)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <CardTitle>{title}</CardTitle>
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">
                {Object.values(filters).filter(v => v !== "").length} active
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? "Hide" : "Show"} Filters
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {showFilters && (
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {filterConfigs.map((config) => (
              <div key={config.key}>
                {renderFilterInput(config)}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export interface DataTableWithFiltersProps<T> {
  data: T[];
  filterConfigs: FilterConfig[];
  getFilterOptions?: (data: T[]) => Record<string, string[]>;
  customFilterLogic?: (item: T, filters: FilterValues) => boolean;
  title?: string;
  className?: string;
  renderTable: (filteredData: T[]) => React.ReactNode;
  renderMetrics?: (filteredData: T[], totalData: T[]) => React.ReactNode;
}

export function DataTableWithFilters<T>({
  data,
  filterConfigs,
  getFilterOptions,
  customFilterLogic,
  title = "Filters",
  className = "",
  renderTable,
  renderMetrics,
}: DataTableWithFiltersProps<T>) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [isExpanded, setIsExpanded] = useState(false);

  // Get filter options if provided
  const filterOptions = useMemo(() => {
    return getFilterOptions ? getFilterOptions(data) : {};
  }, [data, getFilterOptions]);

  // Default filter logic
  const defaultFilterLogic = (item: T, filters: FilterValues): boolean => {
    // This is a basic implementation - custom logic should be provided for specific use cases
    return true;
  };

  // Apply filters to data
  const filteredData = useMemo(() => {
    const filterLogic = customFilterLogic || defaultFilterLogic;
    return data.filter(item => filterLogic(item, filters));
  }, [data, filters, customFilterLogic]);

  // Clear all filters
  const clearFilters = () => {
    const clearedFilters: FilterValues = {};
    filterConfigs.forEach(config => {
      clearedFilters[config.key] = "";
    });
    setFilters(clearedFilters);
  };

  // Check if any filters are active
  const hasActiveFilters = Object.values(filters).some(value => value !== "");

  // Update a specific filter
  const updateFilter = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Render filter input based on type
  const renderFilterInput = (config: FilterConfig) => {
    const { key, type, placeholder, options, icon: Icon } = config;

    switch (type) {
      case 'search':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={placeholder || "Search..."}
                value={filters[key] || ""}
                onChange={(e) => updateFilter(key, e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <Select
              value={filters[key] || ""}
              onValueChange={(value) => updateFilter(key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={placeholder || `All ${config.label.toLowerCase()}`} />
              </SelectTrigger>
              <SelectContent>
                {options?.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
                {filterOptions[key]?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );

      case 'date':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                value={filters[key] || ""}
                onChange={(e) => updateFilter(key, e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        );

      case 'duration':
        return (
          <div className="space-y-2">
            <label className="text-sm font-medium">{config.label}</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Min"
                  value={filters[`${key}_min`] || ""}
                  onChange={(e) => updateFilter(`${key}_min`, e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  placeholder="Max"
                  value={filters[`${key}_max`] || ""}
                  onChange={(e) => updateFilter(`${key}_max`, e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={className}>
      {/* Filters Section */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              <CardTitle className="text-lg">{title}</CardTitle>
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  {Object.values(filters).filter(v => v !== "").length} active
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearFilters}
                  className="h-8"
                >
                  Clear All
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
                className="h-8"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="h-4 w-4 mr-1" />
                    Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4 mr-1" />
                    Show
                  </>
                )}
              </Button>
            </div>
          </div>
          {hasActiveFilters && (
            <CardDescription>
              Showing {filteredData.length} results
              {data.length !== filteredData.length && (
                <span className="text-muted-foreground">
                  (filtered from {data.length} total)
                </span>
              )}
            </CardDescription>
          )}
        </CardHeader>
        {isExpanded && (
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filterConfigs.map((config) => (
                <div key={config.key}>
                  {renderFilterInput(config)}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* Metrics Section */}
      {renderMetrics && renderMetrics(filteredData, data)}

      {/* Table Section */}
      {renderTable(filteredData)}
    </div>
  );
} 