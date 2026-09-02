#!/bin/bash

# --- Setup for finding the script's directory ---
pushd . > /dev/null
SCRIPT_PATH="${BASH_SOURCE[0]}";
if ([ -h "${SCRIPT_PATH}" ]) then
  while([ -h "${SCRIPT_PATH}" ]) do cd `dirname "$SCRIPT_PATH"`; SCRIPT_PATH=`readlink "${SCRIPT_PATH}"`; done
fi
cd `dirname ${SCRIPT_PATH}` > /dev/null
SCRIPT_PATH=`pwd`;
popd  > /dev/null

# --- Git Information Retrieval ---
shortRev=`git rev-parse --short=8 HEAD`
longRev=`git rev-parse HEAD`
date=$(git show -s --format=%cd --date=short ${longRev})
echo "Building stuff..."
echo "git short rev: ${shortRev}"
echo "commit date: ${date}"
# ------------------------------------------------

build_package_linux()
{
    echo 'Creating linux executable...'

    PACKAGE_JSON_FILE="${SCRIPT_PATH}/package.json"
    GIT_REV_JSON_FILE="gitRev.json" # Assumes it's written in the current directory

    # 1. Get the current version from package.json (read only — no bump)
    # Uses Node (always available in this project) to extract the 'version' field
    PACKAGE_VERSION=$(node -e "process.stdout.write(require(process.argv[1]).version)" "${PACKAGE_JSON_FILE}")
    if [ -z "$PACKAGE_VERSION" ]; then
        echo "Error: Could not read version from ${PACKAGE_JSON_FILE}. Exiting."
        exit 1
    fi
    echo "Current version: ${PACKAGE_VERSION}"

    # 2. Construct the full version string
    VERSION=${PACKAGE_VERSION}-${shortRev}

    # 3. Create/Update gitRev.json with the current version and git info
    # Using Node to construct (and pretty-print) the JSON object for gitRev.json
    node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({short: process.argv[2], long: process.argv[3], date: process.argv[4], version: process.argv[5]}, null, 2) + '\n')" \
      "${GIT_REV_JSON_FILE}" "${shortRev}" "${longRev}" "${date}" "${PACKAGE_VERSION}"

    echo "Done."

}

# --- Rest of the script remains the same ---
build_all()
{ 
  build_package_linux
}

usage()
{
    echo 'Display some usage here...'
}

while [ "$1" != "" ]; do
    case $1 in
        -d | --linux ) build_package_linux
                        exit
                        ;;
        -h | --help )   usage
                        exit
                        ;;
        * )             usage
                        exit                        
    esac
done

echo 'No options given,  executing build_all...'
build_all