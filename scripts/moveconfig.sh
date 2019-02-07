# Try to cat the file from google3 head
CONFIG=$(cat "/google/src/head/depot/google3/devrel/g3doc/firebase/ossbot/config.json" 2> /dev/null)
RS=$?

# If the cat failed (due to whatever, print a warning).
if [[ $RS != 0 ]];
then
    echo "WARN: unable to automatically move config, make sure you have the latest."
    exit 0
fi

echo "Writing config to functions/config/config.json"
echo "$CONFIG" > ./functions/config/config.json