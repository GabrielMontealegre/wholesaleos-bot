# Facebook buyers: what we've learned and where to look

Living knowledge base for buyer outreach (D-021, D-022, D-026, D-033). Aggregate lessons only: **no personal names, profiles, emails or phones in this file.** Person-level notes stay on Gabriel's PC (gitignored) and, once issue #260 ships, in the WholesaleOS buyer database.

Source: a deep read on 2026-10-06 of 26 "buyer" posts in 9 Texas and Florida wholesaling groups, with full post text and visible replies. Add to this file after every research run.

## 1. Who is really posting "I'm buying"

Of 26 posts that looked like buyers:
- **~16 real end buyers** with a written buy box.
- **~4 middlemen**: joint-venture wholesalers, a builder's lot finder, a land-entitlement firm.
- **1 lender-seeker**: "luxury builder" who needs capital.
- **1 marketing/lending outfit** making volume claims ("291 closed this month") while offering financing.
- **1 wholesaler** selling his own deals, **1 out-of-market** buyer (Virginia), **1 unreadable**.

Never classify from the first line. Open the full post ("see more") and read it, including the replies.

## 2. Post age

Many buyer posts that still show up in search are **3–8 months old**. A buy box older than about 3 months is "ask if still current", not "send a deal". Record the post date with every buyer.

## 3. What serious buyers ask for (consistent across markets)

Almost every real buyer lists the same package:
1. property address
2. asking price
3. ARV **with comps**: one strict buyer wants comps sold within the last 3 months and within 0.5 miles
4. repair estimate
5. occupancy (vacant or occupied)
6. photos
7. **from the contract holder only**: "no daisy chains"

So the B-17 deal summary should produce exactly this package. One buyer said deals "not moving" in his market are usually priced too close to retail, or their rehab is underestimated.

## 4. How buy boxes are written (fields to capture in the buyer database)

- area: counties, cities, or **ZIP lists** (one DFW buyer lists 16 ZIPs)
- property type: house, duplex, 2–4 units, townhome, condo (many say "no condos"), land
- price: max purchase, or a % of ARV (60–70%, 65–70%, 70–75% minus repairs); sometimes a minimum ARV ($300k+)
- size: beds, baths, sq ft; build year (1950+ / 1970+)
- construction: Florida buyers often require **block construction** and **flood zone X**
- rehab tolerance: cosmetic only, light-to-medium, or heavy (fire, foundation)
- exclusions: HOA, structural, fire, unpermitted work, foreclosures, deals from the big national wholesalers
- funding: cash, hard money, "no lenders", creative financing (subject-to, seller finance)
- speed: closes in 7–30 days

## 5. Replies under buyer posts

Visible replies are mostly noise: "DM", "DM me", "Check your email", "what's a good email to send deals?", wholesalers pitching other states, and service sellers (VAs, marketing). **Generic replies don't stand out.** What stands out is a reply or message that quotes their buy box and promises their exact package.

## 6. Outreach rules (from this research)

- **Don't ask "what's your buy box?" when they already posted it.** Quote it, ask whether it's still current, and say you'll send the package they asked for.
- **If they published an email, email them.** Messenger messages from non-friends land in a hidden requests folder.
- **Comment and message together:** a short, specific comment on their post ("Rob, working Pinellas off-market, sent you a DM") makes Facebook notify them.
- Be wary of anyone who wants full deal details first while also selling financing or marketing.
- Never post an address or price in a public comment.
- Keep to 15–20 new contacts a day, each worded differently (Facebook flags identical messages and comments).

## 7. Where to look: markets from the repo's demand index

Ranking source: `data/market-demand-index.json`, built from Census population and growth data, CBSA metro areas and USDA rural-urban codes. Its top 200 counties fall into **76 metro areas**. Facebook groups are organized by metro, so research goes metro by metro in this order. Detroit (D-002, second comp market) is #66 here by demand score but is a priority market anyway.

Joined groups so far (2026-10-06):
- **DFW:** DFW Wholesale Investment Real Estate; DFW Flips Property Marketplace.
- **Texas:** Texas Wholesale Real Estate.
- **Florida:** Cash Buyers Florida; Florida Real Estate Investors; Florida Real estate Investors/cash buyer; Florida Real Estate Investors Buy And Sell Wholesale Only.
- **North Carolina:** NC Real Estate Investors; Charlotte NC Real Estate Investors.
- **National:** Wholesaling real estate and cash buyers network; Real Estate Wholesale deals.

Candidates found for Houston, San Antonio, Austin, Tampa, Orlando, South Florida, North Carolina and Texas land are in the assistant's group list. Add more as each metro is researched.

| # | Metro (Census CBSA) | Best county rank | Top-200 counties | Counties |
|---|---|---|---|---|
| 1 | Houston-Pasadena-The Woodlands, TX | 1 | 8 | Montgomery County, Brazoria County, Fort Bend County, Harris County, Galveston County, Liberty County |
| 2 | Charlotte-Concord-Gastonia, NC-SC | 2 | 8 | Mecklenburg County, Cabarrus County, Union County, Gaston County, York County, Lincoln County |
| 3 | Austin-Round Rock-San Marcos, TX | 3 | 4 | Williamson County, Travis County, Hays County, Bastrop County |
| 4 | Jacksonville, FL | 5 | 4 | Duval County, St. Johns County, Clay County, Nassau County |
| 5 | Indianapolis-Carmel-Greenwood, IN | 8 | 6 | Hamilton County, Hendricks County, Johnson County, Hancock County, Marion County, Boone County |
| 6 | San Antonio-New Braunfels, TX | 10 | 3 | Comal County, Guadalupe County, Bexar County |
| 7 | Raleigh-Cary, NC | 11 | 2 | Wake County, Johnston County |
| 8 | Nashville-Davidson--Murfreesboro--Franklin, TN | 12 | 7 | Rutherford County, Williamson County, Davidson County, Wilson County, Sumner County, Maury County |
| 9 | Columbus, OH | 14 | 5 | Delaware County, Franklin County, Fairfield County, Union County, Licking County |
| 10 | New York-Newark-Jersey City, NY-NJ | 17 | 8 | Ocean County, Nassau County, Suffolk County, Monmouth County, Union County, Essex County |
| 11 | Chicago-Naperville-Elgin, IL-IN | 26 | 8 | Kendall County, Will County, Kane County, McHenry County, Lake County, DuPage County |
| 12 | Spartanburg, SC | 27 | 1 | Spartanburg County |
| 13 | Tampa-St. Petersburg-Clearwater, FL | 28 | 3 | Pasco County, Hillsborough County, Hernando County |
| 14 | Greenville-Anderson-Greer, SC | 30 | 2 | Greenville County, Anderson County |
| 15 | Dallas-Fort Worth-Arlington, TX | 31 | 9 | Tarrant County, Rockwall County, Ellis County, Kaufman County, Parker County, Dallas County |
| 16 | Philadelphia-Camden-Wilmington, PA-NJ-DE-MD | 33 | 8 | Chester County, Burlington County, Montgomery County, New Castle County, Camden County, Gloucester County |
| 17 | Atlanta-Sandy Springs-Roswell, GA | 35 | 14 | Gwinnett County, Forsyth County, Cherokee County, Henry County, Paulding County, Cobb County |
| 18 | Washington-Arlington-Alexandria, DC-VA-MD-WV | 36 | 11 | Loudoun County, District of Columbia, Frederick County, Prince William County, Stafford County, Spotsylvania County |
| 19 | Denver-Aurora-Centennial, CO | 40 | 4 | Denver County, Douglas County, Broomfield County, Adams County |
| 20 | Clarksville, TN-KY | 45 | 1 | Montgomery County |
| 21 | Oklahoma City, OK | 49 | 3 | Canadian County, Oklahoma County, Cleveland County |
| 22 | Bridgeport-Stamford-Danbury, CT | 50 | 2 | Greater Bridgeport Planning Region, Western Connecticut Planning Region |
| 23 | Portland-Vancouver-Hillsboro, OR-WA | 51 | 2 | Clark County, Washington County |
| 24 | Seattle-Tacoma-Bellevue, WA | 57 | 3 | Snohomish County, King County, Pierce County |
| 25 | Huntsville, AL | 61 | 2 | Madison County, Limestone County |
| 26 | Orlando-Kissimmee-Sanford, FL | 64 | 4 | Orange County, Lake County, Osceola County, Seminole County |
| 27 | Trenton-Princeton, NJ | 66 | 1 | Mercer County |
| 28 | Deltona-Daytona Beach-Ormond Beach, FL | 72 | 2 | Flagler County, Volusia County |
| 29 | Boston-Cambridge-Newton, MA-NH | 75 | 5 | Middlesex County, Plymouth County, Essex County, Norfolk County, Rockingham County |
| 30 | Sacramento-Roseville-Folsom, CA | 83 | 2 | Placer County, Sacramento County |
| 31 | College Station-Bryan, TX | 84 | 1 | Brazos County |
| 32 | Columbia, SC | 86 | 2 | Lexington County, Richland County |
| 33 | Miami-Fort Lauderdale-West Palm Beach, FL | 87 | 2 | Miami-Dade County, Broward County |
| 34 | Waterbury-Shelton, CT | 88 | 1 | Naugatuck Valley Planning Region |
| 35 | Allentown-Bethlehem-Easton, PA-NJ | 90 | 2 | Northampton County, Lehigh County |
| 36 | Kansas City, MO-KS | 93 | 3 | Johnson County, Clay County, Jackson County |
| 37 | Lakeland-Winter Haven, FL | 95 | 1 | Polk County |
| 38 | Memphis, TN-MS-AR | 100 | 1 | DeSoto County |
| 39 | New Haven, CT | 102 | 1 | South Central Connecticut Planning Region |
| 40 | Hagerstown-Martinsburg, MD-WV | 103 | 1 | Berkeley County |
| 41 | Omaha, NE-IA | 107 | 2 | Sarpy County, Douglas County |
| 42 | Tulsa, OK | 110 | 1 | Tulsa County |
| 43 | Charleston-North Charleston, SC | 114 | 3 | Berkeley County, Charleston County, Dorchester County |
| 44 | Providence-Warwick, RI-MA | 120 | 2 | Providence County, Bristol County |
| 45 | Savannah, GA | 122 | 1 | Chatham County |
| 46 | Louisville/Jefferson County, KY-IN | 124 | 2 | Clark County, Jefferson County |
| 47 | Hickory-Lenoir-Morganton, NC | 128 | 1 | Catawba County |
| 48 | Greeley, CO | 137 | 1 | Weld County |
| 49 | Worcester, MA | 139 | 1 | Worcester County |
| 50 | Palm Bay-Melbourne-Titusville, FL | 141 | 1 | Brevard County |
| 51 | Gainesville, GA | 144 | 1 | Hall County |
| 52 | Killeen-Temple, TX | 145 | 1 | Bell County |
| 53 | Tyler, TX | 146 | 1 | Smith County |
| 54 | Hartford-West Hartford-East Hartford, CT | 147 | 1 | Capitol Planning Region |
| 55 | Minneapolis-St. Paul-Bloomington, MN-WI | 148 | 3 | Anoka County, Wright County, Washington County |
| 56 | Reading, PA | 150 | 1 | Berks County |
| 57 | Harrisburg-Carlisle, PA | 157 | 1 | Cumberland County |
| 58 | Myrtle Beach-Conway-North Myrtle Beach, SC | 160 | 1 | Horry County |
| 59 | Fayetteville-Springdale-Rogers, AR | 166 | 1 | Benton County |
| 60 | Bremerton-Silverdale-Port Orchard, WA | 168 | 1 | Kitsap County |
| 61 | Bowling Green, KY | 173 | 1 | Warren County |
| 62 | Gainesville, FL | 174 | 1 | Alachua County |
| 63 | Stockton-Lodi, CA | 175 | 1 | San Joaquin County |
| 64 | Naples-Marco Island, FL | 178 | 1 | Collier County |
| 65 | Durham-Chapel Hill, NC | 179 | 1 | Durham County |
| 66 | Detroit-Warren-Dearborn, MI | 180 | 1 | Oakland County |
| 67 | Ocala, FL | 183 | 1 | Marion County |
| 68 | Port St. Lucie, FL | 184 | 1 | St. Lucie County |
| 69 | Wilmington, NC | 185 | 1 | New Hanover County |
| 70 | Milwaukee-Waukesha, WI | 189 | 1 | Waukesha County |
| 71 | York-Hanover, PA | 190 | 1 | York County |
| 72 | Boise City, ID | 192 | 1 | Canyon County |
| 73 | Chattanooga, TN-GA | 193 | 1 | Hamilton County |
| 74 | Baltimore-Columbia-Towson, MD | 196 | 1 | Anne Arundel County |
| 75 | Seaford, DE | 198 | 1 | Sussex County |
| 76 | Hilton Head Island-Bluffton-Port Royal, SC | 199 | 1 | Beaufort County |
