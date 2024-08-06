import { NavLink, useLocation } from "@remix-run/react";
import BgImage from "./TransparentBGImage";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";

const CampaignEmptyState = ({hasAccess = false, type}:{hasAcces:boolean; type: "number" | "campaign"}) => {
    const loc = useLocation();
    let isCampaignsRoute = loc?.pathname?.split('/').pop() === 'campaigns';
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
            <p className="font-Zilla-Slab text-lg max-w-md text-center">Get started by renting a number or setting up your own.</p>
            }
          </CardHeader>
         {hasAccess && <div className="py-4 flex justify-center">
            {type === 'campaign' ? <Button asChild>
            <NavLink to={isCampaignsRoute ? "new" : "campaigns/new"}>
              Add Campaign
              </NavLink>
            </Button>:
            <Button asChild>
            <NavLink to={isCampaignsRoute ? "settings/numbers" : "./settings/numbers"}>
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