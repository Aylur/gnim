{
  description = "Gnim";

  outputs = inputs: {
    templates = {
      default = {
        path = ./nix/template;
        description = "Gnim Application";
        welcomeText = ''
          # Getting Started

          - `nix develop` to enter the development environment
          - `pnpm create gnim@beta` to set up the initial project
          - `pnpm dev` to start the development process
        '';
      };
    };
  };
}
