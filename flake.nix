{
  description = "Gnim";

  outputs = inputs: {
    templates = {
      default = {
        path = ./nix/template;
        description = "Gnim Application";
        welcomeText = ''
          # Getting Started

          - `nix develop` to enter the develop environment
          - `pnpm create gnim@beta` to setup the initial project
          - `pnpm dev` to start the develop process
        '';
      };
    };
  };
}
