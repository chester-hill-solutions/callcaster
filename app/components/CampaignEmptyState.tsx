import { NavLink, useLocation } from "@remix-run/react";
import BgImage from "./TransparentBGImage";
import { Button } from "./ui/button";
import { Card, CardHeader } from "./ui/card";

const CampaignEmptyState = ({hasAccess = false}) => {
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
            <p className="font-Zilla-Slab text-lg max-w-md text-center">Select an available campaign{hasAccess  ?', or add a new one to get started!':' or contact your admin team to get set up.'}</p>
          </CardHeader>
         {hasAccess && <div className="py-4 flex justify-center">
            <Button asChild>
            <NavLink to={isCampaignsRoute ? "new" : "campaigns/new"}>
              Add Campaign
              </NavLink>
            </Button>
          </div>}
        </Card>
      </div>
    </BgImage>
)}

export default CampaignEmptyState;