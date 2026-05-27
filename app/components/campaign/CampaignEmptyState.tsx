import { NavLink, useLocation } from "react-router";
import BgImage from "@/components/shared/TransparentBGImage";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

const CampaignEmptyState = ({hasAccess = false, type}:{hasAccess:boolean; type: "number" | "campaign"}) => {
    const loc = useLocation();
    const isCampaignsRoute = loc?.pathname?.split('/').pop() === 'campaigns';
    return (
    <BgImage
      opacity={0.1}
      image="/Hero-1.png"
      className="h-full w-full flex flex-auto"
    >
      <div className="flex h-full flex-1 items-center justify-center pb-40 relative" style={{zIndex:3}}>
        <Card >
          <CardHeader>
            <h1 className="font-Zilla-Slab text-4xl text-center">
              Get started!
            </h1>
            {type === 'campaign' ? <p className="font-Zilla-Slab text-lg max-w-md text-center">Select an available campaign{hasAccess  ?', or add a new one to get started!':' or contact your admin team to get set up.'}</p> :
            <p className="font-Zilla-Slab text-lg max-w-md text-center">Start by renting a number. After you create your first campaign, we&apos;ll walk you through script, queue, and launch setup step by step.</p>
            }
          </CardHeader>
         {hasAccess && <div className="py-4 flex justify-center">
            {type === 'campaign' ? <Button asChild>
            <NavLink to={isCampaignsRoute ? "new" : "campaigns/new"}>
              Add Campaign
              </NavLink>
            </Button>:
            <Button asChild>
            <NavLink to={isCampaignsRoute ? "../settings/numbers/purchase" : "./settings/numbers/purchase"}>
              Get a Number
              </NavLink>
            </Button>
            }
          </div>}
        </Card>
      </div>
    </BgImage>
)}


export default CampaignEmptyState;