{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        # 開発で使用するツールの宣言
        tools = with pkgs; [
        	bun
        	nodejs_22
        	deno
        ];
      in
      {
        # `nix develop` への対応。
        devShells.default = pkgs.mkShell {
          buildInputs = tools;
          shellHook = ''

          '';
        };

        formatter = pkgs.nixpkgs-fmt;
      }
    );
}
