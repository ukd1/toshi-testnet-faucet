# Toshi Testnet Faucet.

This simple bot can:
* take donations to the faucet
* send you testnet monies

You can add it by messaging @TestnetFaucet, or scanning this qrcode:

![@TestnetFaucet on Toshi](https://github.com/ukd1/toshi-testnet-faucet/raw/master/attachments/testnetfaucet.png)

Any suggestions, please feel free to message @russell on Toshi or open a ticket. Donations (of testnet eth only!) welcome to 0x2f7aad208e09c5bf1e07eba5702b48ba7731d165.

## Running locally with Docker

You can run the project locally with

```
docker-compose up
```

If any new depencies are added you can rebuild the project with

```
docker-compose build
```

To reset the postgres database in your dev environment you can use

```
docker-compose down -v
```


## See also

* [https://www.toshi.org]
* [http://developers.toshi.org/docs/creating-a-token-app]
