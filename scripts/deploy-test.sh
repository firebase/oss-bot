# Make sure to run firebase use --add before running this
# and select a project to give the alias 'test'

# Current directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SRC=$DIR/../

# Important files
CONFIG_DIR="${SRC}/functions/config"
REAL_CONFIG="${CONFIG_DIR}/config.json"
REAL_CONFIG_BAK="${REAL_CONFIG}.bak"
TEST_CONFIG="${SRC}/functions/test/mock_data/config.json"

# Backup real config
if [ -e $REAL_CONFIG ]
then
    echo "Backing up config."
    mv $REAL_CONFIG $REAL_CONFIG_BAK
fi

# Move test config into place
echo "Moving test config into place."

mkdir -p $CONFIG_DIR
cp $TEST_CONFIG $REAL_CONFIG

# Deploy
echo "Deploying firebase..."
firebase --project "test" deploy --only functions
echo "Done."

# Undo config moves
rm $REAL_CONFIG
if [ -e $REAL_CONFIG_BAK ]
then
    echo "Restoring config."
    mv $REAL_CONFIG_BAK $REAL_CONFIG
fi