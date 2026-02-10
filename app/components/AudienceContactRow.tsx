import { MdEdit, MdRemoveCircleOutline } from "react-icons/md";
import { Button } from "./ui/button";
import { NavLink } from "react-router-dom";
import type { Contact } from "@/lib/types";
import type { Json } from "@/lib/database.types";
import { logger } from "@/lib/logger.client";

// Enhanced type definitions
export interface AudienceContactRowProps {
  contact: Contact;
  audience_id: string | number;
  otherDataHeaders: string[];
  isSelected?: boolean;
  onSelect: (contactId: number, checked: boolean) => void;
  onRemove: (contactId: number) => void;
}

export interface OtherDataItem extends Record<string, unknown> {
  [key: string]: unknown;
}

export const AudienceContactRow: React.FC<AudienceContactRowProps> = ({ 
  contact, 
  audience_id: _audience_id,
  otherDataHeaders, 
  isSelected = false, 
  onSelect,
  onRemove
}) => {
  // Helper function to safely extract other_data values
  const getOtherDataValue = (header: string): string => {
    try {
      const data = contact.other_data.find((item: Json) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return (item as OtherDataItem)[header] !== undefined;
        }
        return false;
      });
      
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const value = (data as OtherDataItem)[header];
        return value != null ? String(value) : '';
      }
      
      return '';
    } catch (error) {
      logger.error('Error extracting other_data value:', error);
      return '';
    }
  };

  // Helper function to format date safely
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      logger.error('Error formatting date:', error);
      return '';
    }
  };

  // Helper function to format time safely
  const formatTime = (dateString: string | null): string => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: 'numeric',
      });
    } catch (error) {
      logger.error('Error formatting time:', error);
      return '';
    }
  };

  return (
    <div className="flex items-center justify-between p-4 border-b border-gray-200 hover:bg-gray-50">
      <div className="flex items-center space-x-4 flex-1">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={(e) => onSelect(contact.id, e.target.checked)}
          className="rounded border-gray-300"
        />
        
        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="text-sm">
            <span className="font-medium text-gray-500">ID:</span>
            <span className="ml-2">{contact.id}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">External ID:</span>
            <span className="ml-2">{contact.external_id || '-'}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">Name:</span>
            <span className="ml-2">
              {[contact.firstname, contact.surname].filter(Boolean).join(' ') || '-'}
            </span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">Phone:</span>
            <span className="ml-2">{contact.phone || '-'}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">Email:</span>
            <span className="ml-2">{contact.email || '-'}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">Address:</span>
            <span className="ml-2">{contact.address || '-'}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">City:</span>
            <span className="ml-2">{contact.city || '-'}</span>
          </div>
          
          <div className="text-sm">
            <span className="font-medium text-gray-500">Created:</span>
            <span className="ml-2">
              {contact.created_at ? (
                <>
                  {formatDate(contact.created_at)}
                  <br />
                  {formatTime(contact.created_at)}
                </>
              ) : '-'}
            </span>
          </div>
          
          {otherDataHeaders.map((header: string) => (
            <div key={header} className="text-sm">
              <span className="font-medium text-gray-500">{header}:</span>
              <span className="ml-2">{getOtherDataValue(header) || '-'}</span>
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex items-center space-x-2">
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => onRemove(contact.id)}
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
        >
          <MdRemoveCircleOutline className="w-4 h-4" />
        </Button>
        
        <Button variant="ghost" size="sm" asChild>
          <NavLink 
            to={`../../contacts/${contact.id}`} 
            relative="path"
            className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
          >
            <MdEdit className="w-4 h-4" />
          </NavLink>
        </Button>
      </div>
    </div>
  );
};