import React, { useState } from 'react';
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "~/components/ui/card";

export const EditResponseModal = ({ isOpen, onClose, onSave, initialInput }) => {
  const [input, setInput] = useState(initialInput || '');

  const handleSave = () => {
    onSave(input);
  };

  const inputOptions = [...Array(10).keys(), 'Voice - Any'];

  if (!isOpen) return null;

  return (
    <Card className="absolute z-20 transform translate-y-10 w-[280px] bg-background">
      <CardHeader>
        <CardTitle>Response</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <h3 className="font-medium mb-2">Input</h3>
          <div className="flex flex-wrap gap-2">
            {inputOptions.map((option) => (
              <Button
                key={option}
                variant="outline"
                size="sm"
                onClick={() => setInput(option === 'Voice - Any' ? 'vx-any' : option.toString())}
                className={`h-[50px] min-w-[50px] rounded-full px-4 ${
                  input === (option === 'Voice - Any' ? 'vx-any' : option.toString())
                    ? 'bg-primary text-primary-foreground'
                    : ''
                }`}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end space-x-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>
          Save
        </Button>
      </CardFooter>
    </Card>
  );
};