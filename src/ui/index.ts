import { NetlifyIntegrationUI } from "@netlify/sdk";

const integrationUI = new NetlifyIntegrationUI("LambdaTest Integration");

const surface = integrationUI.addSurface("integrations-settings");
const route = surface.addRoute("/");

route.addText({
    value: "Welcome to the LambdaTest integration",
});

route.addForm(
    {
      title: "Configuration",
      id: "configuration-form",
      onSubmit: async (surfaceState) => {
        const { integrationContext, fetch, picker } = surfaceState;
        const { siteId, accountId } = integrationContext;
  
        const username = picker.getFormInputValue("configuration-form", "username");
        const token = picker.getFormInputValue("configuration-form", "token");
        const project = picker.getFormInputValue("configuration-form", "project");

        const linkResponse = await fetch('lambdatest-user-auth', {
            method: "POST",
            body: JSON.stringify({ siteId, accountId, username, token, project })
        }); //https://sdk.netlify.com/integration-ui/call-api-handlers/
      },
    },
    (card) => {
        card.addInputText({
            id: "username",
            label: "Username",
        });
        card.addInputPassword({
            id: "token",
            label: "Access Key",
        });
        card.addInputPassword({
            id: "project",
            label: "SmartUI Project Name",
        });
    }
);

route.addLink({
    href: "https://mysitename.netlify.app",
    text: "Learn more about this integration",
});

export { integrationUI };