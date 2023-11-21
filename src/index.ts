// Documentation: https://sdk.netlify.com
import { NetlifyIntegration } from "@netlify/sdk";
import { getConfigFileParsingDiagnostics } from "typescript";

import fs from 'fs';
import path from 'path';
import cheerio from 'cheerio';
import axios, { all } from 'axios';
import {chromium} from 'playwright'
import { EnvVarRequest } from "@netlify/sdk/client";

const integration = new NetlifyIntegration();


integration.addApiHandler("lambdatest-user-auth", async (event, context) => {
  try {
    const { client } = context;

    if (!event.body) {
      event.body = '';
    }

    const eventBody = JSON.parse(event.body);
    const { siteId, accountId, username, token, project } = eventBody;

    const lambdatestUserAuthUrl = `https://auth.lambdatest.com/api/user/token/auth`;

    // Use the data property in the axios post
    const authResponse = await axios.post(lambdatestUserAuthUrl, { ...eventBody }, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const envVariables: Record<string, EnvVarRequest> = {
      LAMBDATEST_USERNAME: username,
      LAMBDATEST_ACCESS_KEY: token,
      LAMBDATEST_PROJECT_ID: project
    }

    const tokenEnvironmentVariableObject = {
      accountId, // Include the accountId property
      siteId,
      variables: envVariables
    };
    
    const environmentVariable = await client.createOrUpdateVariables(tokenEnvironmentVariableObject);

    console.log(`Status for the final response: ${environmentVariable}`);
    console.log(`Status for the final response: ${JSON.stringify(environmentVariable)}`);

    return {
      statusCode: authResponse.status,
      body: JSON.stringify({ success: true }),
    };
  } catch (error: any) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
});


integration.onEnable(async (_, { teamId, siteId, client }) => {
  // Build event handlers are disabled by default, so we need to
  // enable them when the integration is enabled.

  console.log(`Hello world from onEnable event: ${siteId}`);
  siteId && await client.enableBuildEventHandlers(siteId);
  
  return {
    statusCode: 200,
  };
});

integration.addBuildEventHandler(
  "onPreBuild",
  async ({ buildConfig, constants, netlifyConfig }) => {
    console.log(`The constants for preBuild are: ${JSON.stringify(constants)}`);

    try {
      // Example: Read HTML files and extract page URLs
      try {
        // Get the list of generated files from the Netlify API
        const netlifyApiUrl = `https://api.netlify.com/api/v1/sites/${constants.SITE_ID}`;
        const response = await axios.get(netlifyApiUrl, {
          headers: {
            Authorization: `Bearer ${constants.NETLIFY_API_TOKEN}`,
          },
        });
  
        if (response.data) {
          const siteData = response.data;
          
          if (siteData && siteData.url) {
            const buildOutputDir = constants.PUBLISH_DIR;
            const pages = await extractPagesFromHTMLFiles(buildOutputDir);
            console.log("List of generated pages:", pages);
      
            if (pages && pages.length > 0) {

              const capabilities = {
                'browserName': 'Chrome', // Browsers allowed: `Chrome`, `MicrosoftEdge`, `pw-chromium`, `pw-firefox` and `pw-webkit`
                'browserVersion': 'latest',
                'LT:Options': {
                  'platform': 'Windows 11',
                  "smartUIBaseline": true,
                  'build': process.env.LAMBDATEST_PROJECT_ID,
                  'name': 'Netlify SmartUI Pre-Deployment Test',
                  'user': process.env.LAMBDATEST_USERNAME,
                  'accessKey': process.env.LAMBDATEST_ACCESS_KEY,
                  'network': true,
                  'video': true,
                  'console': true,
                  "smartUIProjectName": process.env.LAMBDATEST_PROJECT_ID //Add the required Smart UI Project name
                }
              }
            
              const browser = await chromium.connect({
                wsEndpoint: `wss://cdp.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`
              })
      
              for (const generatedPage of pages) {
                const fullURL = siteData.url + generatedPage; // Concatenate the base URL and page
              
                const page = await browser.newPage()
              
                await page.goto(fullURL)
                // Add the following command in order to take screenshot in SmartUI 
                await page.evaluate((_) => {},
                `lambdatest_action: ${JSON.stringify({ action: "smartui.takeScreenshot", arguments: { fullPage: true, screenshotName: generatedPage } })}`);
                
                console.log(`Captured a screenshot of ${fullURL} and sent it to LambdaTest Smart UI.`);
              }
              await browser.close();
            }
          } else {
            console.error("No deploy_url found in siteData.");
          }
          // You can now work with the list of generated files.
        }
      } catch (error) {
        console.error("Error fetching site data:", error);
      }
      
    } catch (error) {
      console.error("Error fetching generated pages:", error);
    }

  }
);

integration.addBuildEventHandler(
  "onPostBuild",
  async ({ buildConfig, constants, netlifyConfig }) => {
    console.log(`The constants are: ${JSON.stringify(constants)}`);


    try {
      // Example: Read HTML files and extract page URLs
      try {
        // Get the list of generated files from the Netlify API
        const netlifyApiUrl = `https://api.netlify.com/api/v1/sites/${constants.SITE_ID}`;
        const response = await axios.get(netlifyApiUrl, {
          headers: {
            Authorization: `Bearer ${constants.NETLIFY_API_TOKEN}`,
          },
        });
  
        if (response.data) {
          const siteData = response.data;
          
          if (siteData && siteData.deploy_url) {
            const buildOutputDir = constants.PUBLISH_DIR;
            const pages = await extractPagesFromHTMLFiles(buildOutputDir);
            console.log("List of generated pages:", pages);
      
            if (pages && pages.length > 0) {
              const capabilities = {
                'browserName': 'Chrome', // Browsers allowed: `Chrome`, `MicrosoftEdge`, `pw-chromium`, `pw-firefox` and `pw-webkit`
                'browserVersion': 'latest',
                'LT:Options': {
                  'platform': 'Windows 11',
                  'build': process.env.LAMBDATEST_PROJECT_ID,
                  'name': 'Netlify SmartUI Post-Deployment Test',
                  'user': process.env.LAMBDATEST_USERNAME,
                  'accessKey': process.env.LAMBDATEST_ACCESS_KEY,
                  'network': true,
                  'video': true,
                  'console': true,
                  "smartUIProjectName": process.env.LAMBDATEST_PROJECT_ID //Add the required Smart UI Project name
                }
              }
            
              const browser = await chromium.connect({
                wsEndpoint: `wss://cdp.lambdatest.com/playwright?capabilities=${encodeURIComponent(JSON.stringify(capabilities))}`
              })
      
              for (const generatedPage of pages) {
                const fullURL = siteData.deploy_url + generatedPage; // Concatenate the base URL and page
              
                const page = await browser.newPage()
              
                await page.goto(fullURL)
                // Add the following command in order to take screenshot in SmartUI 
                await page.evaluate((_) => {},
                `lambdatest_action: ${JSON.stringify({ action: "smartui.takeScreenshot", arguments: { fullPage: true, screenshotName: generatedPage } })}`);
              
                console.log(`Captured a screenshot of ${fullURL} and sent it to LambdaTest Smart UI.`);
              }
              await browser.close();
            }
          } else {
            console.error("No deploy_url found in siteData.");
          }
          // You can now work with the list of generated files.
        }
      } catch (error) {
        console.error("Error fetching site data:", error);
      }
      
    } catch (error) {
      console.error("Error fetching generated pages:", error);
    }

  }
);

async function extractPagesFromHTMLFiles(buildOutputDir: string): Promise<string[]> {
  const pages: string[] = [];

  async function processDirectory(directoryPath: string, parentFolderName: string = '') {
    const items = fs.readdirSync(directoryPath);

    for (const item of items) {
      const itemPath = path.join(directoryPath, item);
      const isDirectory = fs.statSync(itemPath).isDirectory();

      if (isDirectory) {
        // If the item is a subdirectory, recursively process it
        const folderName = path.basename(item);
        await processDirectory(itemPath, parentFolderName ? `${parentFolderName}/${folderName}` : `/${folderName}`);
      } else if (item.endsWith('.html')) {
        // If the item is an HTML file, extract the page URL with folder name and a slash
        const htmlContent = fs.readFileSync(itemPath, 'utf-8');
        const $ = cheerio.load(htmlContent);
        const pageURL = $('meta[property="og:url"]').attr('content') || $('link[rel="canonical"]').attr('href') || item;
        const fullURL = parentFolderName ? `${parentFolderName}/${pageURL}` : `/${pageURL}`;
        pages.push(fullURL);
      }
    }
  }

  // Start the recursive processing from the buildOutputDir
  await processDirectory(buildOutputDir);

  return pages;
}
  
export { integration, extractPagesFromHTMLFiles };
export {};
