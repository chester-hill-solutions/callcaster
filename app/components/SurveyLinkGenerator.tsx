import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Copy, ExternalLink } from "lucide-react";
import { generateSurveyLink } from "~/lib/types";

interface SurveyLinkGeneratorProps {
  contactId: number;
  surveyId: string;
  baseUrl: string;
  onCopy?: (link: string) => void;
}

export default function SurveyLinkGenerator({ 
  contactId, 
  surveyId, 
  baseUrl, 
  onCopy 
}: SurveyLinkGeneratorProps) {
  const [copied, setCopied] = useState(false);
  
  const surveyLink = generateSurveyLink(contactId, surveyId, baseUrl);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(surveyLink);
      setCopied(true);
      onCopy?.(surveyLink);
      
      // Reset copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleOpen = () => {
    window.open(surveyLink, '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Survey Link</CardTitle>
        <CardDescription>
          Generated link for contact {contactId} to take survey {surveyId}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="survey-link">Survey URL</Label>
          <div className="flex gap-2">
            <Input
              id="survey-link"
              value={surveyLink}
              readOnly
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="min-w-[80px]"
            >
              {copied ? (
                "Copied!"
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpen}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Open
            </Button>
          </div>
        </div>
        
        <div className="text-sm text-muted-foreground">
          <p>This link will:</p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Automatically redirect to the survey</li>
            <li>Pre-fill contact information</li>
            <li>Track responses with contact association</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
} 